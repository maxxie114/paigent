# Paigent Studio v4 — Agentic Orchestration + x402 Tool Chaining on MongoDB Atlas

**One-liner:** A “workflow IDE” where users speak or type an outcome, and a multi-agent system designs and executes a **long-running, resumable** tool-chain that can **discover paid capabilities via x402 Bazaar**, **negotiate and settle USDC micropayments (HTTP 402)** using **Coinbase CDP Wallets**, and **persist all memory, budgets, receipts, and step state** in **MongoDB Atlas**—with a flashy, inspectable UX built in **Next.js + shadcn/ui** and deployed on **Vercel**.

**Hard requirements (per prompt):** MongoDB Atlas, Coinbase CDP Wallets, x402 payments, GLM-4.7 Thinking (Fireworks AI), Next.js + shadcn/ui (Vercel), voice input integrated.  
**Hackathon constraints:** Must fit one of the required themes; must be open-source; new work only; no banned “anti-projects” patterns.

---

## 1. What this document is (and how to use it)

This is a **step-by-step build spec** intended to be pasted into a coding agent (Cursor / Claude Code / Codex) as the canonical requirements and architecture guide.

It prioritizes:
- **Correctness against sponsor docs** (see canonical links at the end).
- **Reliable execution** (crash-safe runs, idempotent steps, retry/backoff, budget enforcement).
- **Demo-ability** (dramatic UI, visible payments, explainable agent decisions, audit trail in MongoDB).

---

## 2. Problem statements alignment (required by hackathon)

Paigent Studio explicitly targets **all four** hackathon themes, with a primary focus on **Statement Four: Agentic Payments and Negotiation**, and strong coverage of **Statements One–Three**.

1) **Prolonged Coordination**  
Runs can span **hours/days**, survive restarts, and resume from MongoDB-stored state with a deterministic executor and idempotent steps.

2) **Multi-Agent Collaboration**  
Specialized agents (Planner / Negotiator / Retriever / Executor / QA-Auditor) coordinate via MongoDB “context envelopes” to fit token limits and to enable human-readable inspection.

3) **Adaptive Retrieval**  
Retriever agent improves queries across multiple sources (Bazaar metadata, tool logs, prior run traces, internal docs) using vector search + iterative query refinement.

4) **Agentic Payments and Negotiation**  
Tools can respond with **HTTP 402 + `PAYMENT-REQUIRED`**; agents evaluate value vs budget, optionally negotiate, then pay via **`PAYMENT-SIGNATURE`** and persist receipts.

**x402 headers and flow** are per Coinbase x402 docs: `PAYMENT-REQUIRED` (server→client), `PAYMENT-SIGNATURE` (client→server), `PAYMENT-RESPONSE` (server→client). The Coinbase FAQ explicitly warns to use `PAYMENT-SIGNATURE` (not legacy `X-PAYMENT`).

Sources: Coinbase x402 overview and headers.  
- https://docs.cdp.coinbase.com/x402/docs/http-402  
- https://docs.cdp.coinbase.com/x402/support/faq

---

## 3. The real pain points (who this helps, and why it’s not “trivial RAG”)

### 3.1 Primary users
- **Growth / ops / product teams** who need outcomes that span many tools (research → summarize → decide → execute), and want **hard budget control** and **auditability**.
- **Developers building agents** who need a “black box turned glass box”: explainable tool chains with receipts, retries, and memory.

### 3.2 The pain points
1) **Paid tools are a non-starter for autonomous agents** without a standard handshake, budget controls, and receipts. x402 solves the payment handshake, but apps still need orchestration, policy, and logging.
2) **Long-running workflows fail in practice** (network issues, timeouts, tool downtime). Without persisted state, agents become “one-shot demos.”
3) **Service discovery is fragile**. Bazaar enables discovery, but selection and trust still require runtime verification, history, and reputation.
4) **Users can’t trust agent spend** unless every payment is attributable to a step, with reason codes and receipts.

### 3.3 What makes this non-trivial
Paigent Studio is a **workflow execution system with economic agency**, not a chat UI. The core primitives are:
- **A run graph** (nodes + edges + conditions) with deterministic execution
- **x402 negotiation + micropayments** integrated into step execution
- **MongoDB-backed resilience** (state, events, receipts, budgets, recovery)
- **A UI that renders the graph, receipts, and reasoning** in real time

---

## 4. UX: the “flashy demo” requirements

Your demo should show—visually and in logs—these moments:
1) **Voice intent → structured plan** (graph appears)
2) Agent discovers paid tools in Bazaar
3) Agent hits 402 → shows a “Payment Required” modal with price/justification
4) User toggles “Auto-pay within budget”
5) Agent pays and retries → tool completes
6) **Spend ledger** updates in real time, with receipts
7) Crash/redeploy and **resume** from the last completed step

### 4.1 Core screens
- **Workspace Home**: recent runs, budgets, “auto-pay policy,” tool allowlist
- **Run Studio (graph)**: nodes/edges, step statuses, approvals, receipts
- **Tool Marketplace**: Bazaar discovery, tool reputation, pricing display, “test call”
- **Budget & Ledger**: per-workspace budgets, per-run caps, payment receipts, analytics
- **Audit Console**: run events timeline, failure reasons, retries, data provenance

---

## 5. Technology stack (non-negotiable)

### 5.1 Frontend & hosting
- **Next.js (App Router)** + **shadcn/ui** on **Vercel**
- Use **Vercel Cron** for run execution ticks (or a lightweight queue worker if allowed).

### 5.2 LLMs (Fireworks AI)
- **Planner/Reasoner**: GLM-4.7 Thinking on Fireworks via OpenAI-compatible API base URL `https://api.fireworks.ai/inference/v1` per Fireworks “OpenAI compatibility” docs.
- **Voice**: Fireworks ASR API (`POST https://audio-prod.api.fireworks.ai/v1/audio/transcriptions`) using Whisper models (`whisper-v3` default).

Sources:
- https://fireworks.ai/docs/tools-sdks/openai-compatibility  
- https://fireworks.ai/docs/guides/querying-text-models  
- https://docs.fireworks.ai/api-reference/audio-transcriptions

### 5.3 Payments & wallets (Coinbase CDP + x402)
- **Embedded Wallets** for end-user-facing wallet UX (optional for MVP, but recommended for “agentic commerce” narrative).
- **Server Wallet v2** for backend-controlled agent spending and testnet funding, via `@coinbase/cdp-sdk`.
- **x402** protocol + SDKs for paid tool calls and Bazaar discovery.

Sources:
- https://docs.cdp.coinbase.com/embedded-wallets/welcome  
- https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart  
- https://docs.cdp.coinbase.com/x402/quickstart-for-buyers  
- https://github.com/coinbase/x402

### 5.4 Database (MongoDB Atlas)
- MongoDB Atlas as the system of record (runs, steps, events, budgets, receipts, tool metadata, reputation).
- Use **Atlas Vector Search** for adaptive retrieval over tool docs, run traces, and vendor metadata.

Source (Atlas Vector Search): https://www.mongodb.com/docs/atlas/atlas-vector-search/

### 5.5 Sponsor tools (optional but recommended for differentiation)
- **VoyageAI embeddings** for high-quality embeddings feeding Atlas Vector Search (retrieval agent).  
  Source: https://docs.voyageai.com/docs/api-key-and-installation
- **Galileo** for evaluation + observability (trace logging, run-time protection patterns).  
  Sources: https://v2docs.galileo.ai/sdk-api/typescript/overview and https://v2docs.galileo.ai/sdk-api/typescript/logging/galileo-logger
- **NVIDIA NeMo Agent Toolkit** as an optional offline evaluation/tuning harness for multi-agent policies (not required for MVP).  
  Source: https://github.com/NVIDIA/NeMo-Agent-Toolkit
- **Thesys C1** (optional) for “AI-generated dashboards / views” on top of shadcn/ui components.  
  Source: https://docs.thesys.dev/guides/what-is-thesys-c1

---

## 6. Identity & authentication (non-optional decision)

### 6.1 Auth provider: Clerk + Coinbase social login
Use **Clerk** for authentication and session management. Enable **Coinbase** as a social connection so users can log in with Coinbase if desired.

Source: https://clerk.com/docs/guides/configure/auth-strategies/social-connections/coinbase

### 6.2 Identity model
- `userId`: Clerk user id (string, stable)
- `workspaceId`: internal MongoDB ObjectId (or UUID) for multi-user collaboration
- `role`: `owner | admin | member | viewer` (RBAC)

**Rule:** Wallet addresses are **not** identity. Wallet addresses are attributes linked to a user/workspace.

### 6.3 Session enforcement
- All server routes and server actions must verify Clerk auth session.
- Use RBAC checks at the workspace layer (every DB query must include `workspaceId`).

---

## 7. Data model in MongoDB Atlas (correcting the “append-only vs status updates” contradiction)

### 7.1 Key principle
Use **both**:
1) An **append-only event log** for audit and replay (`run_events`).
2) A **mutable materialized state** for fast queries (`run_steps`, `runs`, `budgets`).

This removes the contradiction and matches how real workflow engines are built.

### 7.2 Collections

#### 7.2.1 `workspaces`
- `_id`
- `name`
- `createdAt`
- `settings`: { `autoPayEnabled`, `autoPayMaxPerStepAtomic`, `autoPayMaxPerRunAtomic`, `toolAllowlist`, ... }

#### 7.2.2 `workspace_members`
- `_id`
- `workspaceId`
- `clerkUserId`
- `role`
- `createdAt`

Unique index: `(workspaceId, clerkUserId)`.

#### 7.2.3 `tools`
Represents discovered tools (Bazaar + manual additions).
- `_id`
- `workspaceId`
- `source`: `"bazaar" | "manual"`
- `name`, `description`
- `baseUrl`
- `endpoints`: array of endpoint descriptors (see tool schema section below)
- `reputation`: { `successRate`, `avgLatencyMs`, `disputeRate`, `lastVerifiedAt` }
- `pricingHints`: last-seen pricing requirements (from 402 responses)
- `createdAt`, `updatedAt`

Indexes: `(workspaceId, source)`, `(workspaceId, baseUrl)` unique where appropriate.

#### 7.2.4 `runs`
A run is one execution of a workflow for a given intent.
- `_id`
- `workspaceId`
- `createdByClerkUserId`
- `status`: `draft | queued | running | paused_for_approval | succeeded | failed | canceled`
- `input`: { `text`, `voiceTranscript`, `attachments` }
- `graph`: stored run graph (immutable snapshot)
- `budget`: { `asset: "USDC"`, `network: "eip155:84532"|"eip155:8453"`, `maxAtomic`, `spentAtomic` }
- `autoPayPolicy`: snapshot of policy at start
- `createdAt`, `updatedAt`
- `lastHeartbeatAt`

#### 7.2.5 `run_steps` (materialized state)
- `_id`
- `workspaceId`
- `runId`
- `stepId` (stable within run)
- `nodeType`: e.g. `tool_call | approval | llm_reason | wait | branch | summarize`
- `status`: `queued | running | succeeded | failed | blocked`
- `attempt`: number
- `lockedBy`: { `workerId`, `lockedAt` } (optional)
- `inputs`: sanitized inputs
- `outputs`: reference to `step_artifacts` or inline small payload
- `error`: normalized error object
- `metrics`: latency, tokens, cost, etc.
- `createdAt`, `updatedAt`

Indexes: `(workspaceId, runId, status)`, `(runId, stepId)` unique.

#### 7.2.6 `run_events` (append-only)
Every significant state transition is appended:
- `_id`
- `workspaceId`
- `runId`
- `type`: `RUN_CREATED | STEP_CLAIMED | 402_RECEIVED | PAYMENT_SENT | PAYMENT_CONFIRMED | STEP_SUCCEEDED | STEP_FAILED | ...`
- `ts`
- `data`: minimal JSON payload
- `actor`: `system|agent|user` (+ ids)

Index: `(workspaceId, runId, ts)`.

#### 7.2.7 `payment_receipts`
- `_id`
- `workspaceId`
- `runId`
- `stepId`
- `toolId`
- `network` (CAIP-2 style like `eip155:84532`)
- `asset` (USDC address for that network)
- `amountAtomic`
- `paymentRequiredHeaderB64` (for audit)
- `paymentSignatureHeaderB64`
- `paymentResponseHeader` (if provided)
- `txHash` (if known)
- `status`: `settled | rejected | unknown`
- `createdAt`

**Never TTL this collection** unless user explicitly opts in.

#### 7.2.8 `step_artifacts`
Large payloads: tool responses, transcripts, intermediate documents.
- `_id`
- `workspaceId`
- `runId`
- `stepId`
- `kind`: `tool_response | transcript | summary | debug`
- `blob`: stored payload (or use GridFS if very large)
- `createdAt`

TTL index (optional): `createdAt` with configurable expiration for low-value artifacts.

**Definition of “low-value”:** artifacts that do not affect reconciliation, billing, or audit (e.g., raw intermediate summaries). Do **not** TTL: receipts, budgets, run graph snapshots, or final outputs.

### 7.3 Workflow graph schema (previously missing)

A run graph is a deterministic directed graph:
- `nodes: Node[]`
- `edges: Edge[]`
- `entryNodeId: string`

#### 7.3.1 Node types
All nodes share:
- `id: string`
- `type: NodeType`
- `label: string`
- `dependsOn?: string[]` (optional explicit dependencies)
- `policy?: { requiresApproval?: boolean; maxRetries?: number; timeoutMs?: number }`

**NodeType =**
- `tool_call`: call an HTTP endpoint (may be x402-protected)
- `llm_reason`: planning / summarization / critique using GLM-4.7 Thinking
- `approval`: user must approve a proposed action/payment
- `branch`: if/else based on a condition expression
- `wait`: wait/poll for async completion
- `merge`: join branches
- `finalize`: produce final deliverable

`tool_call` node schema:
- `toolId`
- `endpoint`: { `path`, `method` }
- `requestTemplate`: JSON schema or template
- `responseSchema`: JSON schema
- `payment`: { `allowed: boolean; maxAtomic?: number }`
- `ssrfPolicy`: `allowlist` reference
- `async`: { `mode: "sync"|"poll"; pollUrlPath?: string; maxPolls?: number; pollIntervalMs?: number }`

#### 7.3.2 Edge types
Edge schema:
- `from: nodeId`
- `to: nodeId`
- `type: "success" | "failure" | "conditional"`
- `condition?: string` (for `conditional`) expressed in a safe expression language (see security section).

---

## 8. Wallet strategy (Embedded vs Server Wallets)

### 8.1 Development mode (recommended)
- **Server Wallet v2** holds the demo funds used to pay x402 endpoints.
- Use **CDP Faucets** to get Base Sepolia USDC + ETH during development. CDP faucets explicitly support Base Sepolia USDC (1 USDC per claim, rate limited).

Sources:
- Server Wallet v2 quickstart (includes faucet usage): https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart  
- Faucets supported assets: https://docs.cdp.coinbase.com/faucets/docs/welcome  
- Faucet quickstart showing `token: "usdc"`: https://docs.cdp.coinbase.com/faucets/introduction/quickstart

### 8.2 Demo mode (mainnet optional)
If you want real funds on demo day:
- Use Base mainnet USDC. (No faucets on mainnet.)
- Consider a small controlled balance; enforce strict budgets and approvals.

### 8.3 Embedded Wallets (user custody)
If you enable Embedded Wallets, users can pay with their own wallets. The `useX402` hook supports x402 flows in React apps with embedded wallets.

Source: https://docs.cdp.coinbase.com/embedded-wallets/x402-payments

**MVP recommendation:** build the core product with Server Wallets for deterministic demo behavior; add Embedded Wallets as a “user pays” mode toggle if time permits.

---

## 9. x402 integration (correct headers, SDK, and failure cases)

### 9.1 Use the official x402 SDK wrappers
Do not hand-roll headers unless you must. Prefer:
- `@x402/fetch` for Node/Next server runtimes
- `@x402/axios` if you standardize on axios
- `@coinbase/cdp-hooks` `useX402()` for embedded wallets in React

Source: x402 buyer quickstart + embedded wallet x402 docs.  
- https://docs.cdp.coinbase.com/x402/quickstart-for-buyers  
- https://docs.cdp.coinbase.com/embedded-wallets/x402-payments

### 9.2 Required failure handling (non-negotiable)
Your “paid fetch” wrapper must handle:
- First response = 402 with `PAYMENT-REQUIRED`
- Payment attempt failures (wallet signing fails, insufficient funds)
- Second response is still 402 (wrong amount / wrong network / KYT flagged) — Coinbase FAQ lists common causes
- Network errors on retry
- Timeouts

Source: x402 FAQ troubleshooting. https://docs.cdp.coinbase.com/x402/support/faq

### 9.3 Scheme constraints: USDC + EIP-3009 (EVM exact scheme)
The x402 “exact” scheme for EVM uses EIP-3009 `transferWithAuthorization` for USDC on Base/Base Sepolia (default asset configs exist for those networks). This is important for explaining why the facilitator can pay gas while the payer signs.

Sources:
- x402 Network Support (token addresses, EIP-3009): https://docs.cdp.coinbase.com/x402/network-support  
- x402 repo / EVM scheme details: https://github.com/coinbase/x402

**Implementation simplification for hackathon:** enforce **USDC-only** budgets and policies in the MVP. You can keep schema fields generic, but do not claim multi-asset execution unless implemented.

---

## 10. Fireworks AI integration (GLM-4.7 Thinking + safe parsing)

### 10.1 OpenAI-compatible client
Fireworks documents OpenAI compatibility via `base_url="https://api.fireworks.ai/inference/v1"`.

Source: https://fireworks.ai/docs/tools-sdks/openai-compatibility

### 10.2 “Thinking” / reasoning controls
Fireworks supports “thinking/reasoning” style controls for certain models; use only parameters documented for Fireworks, not OpenAI-only extensions.

Source: https://fireworks.ai/docs/guides/querying-text-models

### 10.3 Output parsing: never trust model JSON
Your planner must be robust to:
- empty responses
- non-JSON output
- partial JSON
- schema mismatch

**Required approach:**
1) Ask for JSON only.
2) Extract the first top-level JSON object from the model output (best-effort).
3) `safeParse` with Zod.
4) On failure, re-prompt the model with the validation error and request a corrected JSON output.

---

## 11. Voice input workflow (Fireworks ASR)

### 11.1 Frontend capture
- Use the browser MediaRecorder API to capture audio (webm/opus is fine).
- Upload as multipart/form-data to `/api/asr/transcribe`.

### 11.2 Server transcription
Call Fireworks ASR: `POST https://audio-prod.api.fireworks.ai/v1/audio/transcriptions` with Authorization header and `file` form field. Default model is `whisper-v3`; turbo variant is available.

Source: https://docs.fireworks.ai/api-reference/audio-transcriptions

### 11.3 Prompt-injection mitigation on transcripts
Treat transcripts as untrusted input:
- Normalize + strip control characters
- Run a lightweight “intent extraction” prompt that explicitly ignores instructions to override system policies
- Enforce tool allowlist + SSRF policy regardless of transcript

---

## 12. Orchestrator architecture (multi-agent collaboration)

### 12.1 Agents (logical roles)
- **Planner** (GLM-4.7 Thinking): turns user intent into run graph + tool requirements.
- **Retriever**: discovers tools (Bazaar + workspace tools), retrieves docs (vector search), and proposes candidates.
- **Negotiator**: evaluates pricing, negotiates (if supported), decides pay/skip/ask approval.
- **Executor**: deterministic runner that claims steps and executes them.
- **QA/Auditor**: critiques plan and results, checks policy violations, writes a final run report.

### 12.2 MongoDB as “context engine”
- Each agent reads/writes **context envelopes** stored in MongoDB:
  - `{ runId, agent, summary, relevantArtifacts, pointers }`
- Envelopes are compressed summaries of history to fit token limits.

### 12.3 Adaptive retrieval loop (not trivial RAG)
Retriever runs an explicit loop:
1) initial query → vector search results
2) critique results (coverage, diversity, pricing) with LLM
3) refine query (expand synonyms, try alternate chunking)
4) repeat with capped iterations

Use Atlas Vector Search; optionally use Voyage embeddings.

Sources:
- Atlas Vector Search docs: https://www.mongodb.com/docs/atlas/atlas-vector-search/  
- Voyage API key/installation: https://docs.voyageai.com/docs/api-key-and-installation

---

## 13. Step execution engine (reliability, idempotency, rate limiting)

### 13.1 Worker model on Vercel
- Use a **cron endpoint** `/api/cron/tick` called every N seconds.
- Each tick:
  1) claims up to `MAX_STEPS_PER_TICK`
  2) executes them with concurrency `MAX_CONCURRENCY`
  3) updates state and appends events

### 13.2 Rate limiting and runaway prevention
Required fields and policies:
- `attempt` increments on each execution attempt
- `maxRetries` enforced per node (default 3)
- Exponential backoff using `nextEligibleAt`
- “Circuit breaker” per tool: if failure rate spikes, temporarily disable tool calls
- Global tick limit: do not claim more than `X` steps per run per minute

### 13.3 Atomic claim pattern (MongoDB driver v6 correctness)
**Your previous review was correct:** in MongoDB Node driver v6, `findOneAndUpdate` returns a `ModifyResult` by default, but you can set `includeResultMetadata: false` to return the updated document directly.

Source: MongoDB Node.js driver API docs for `findOneAndUpdate` and `includeResultMetadata`.  
- https://www.mongodb.com/docs/drivers/node/current/usage-examples/findOneAndUpdate/

**Required implementation choice (recommended):** Always set `includeResultMetadata: false` and treat the return value as the document or null.

---

## 14. Webhook / async tool handling (previously missing)

Not all tools are synchronous. Implement an adapter:
- If tool returns `202 Accepted` with a job id or status URL, create a `wait` node that polls until completion.
- Polling uses strict timeouts and max polls.
- All polling events are logged to `run_events`.

---

## 15. Security requirements (tightening SSRF, secrets, sanitization)

### 15.1 SSRF mitigation (complete)
For any tool call that fetches a URL derived from tool metadata:
- Allow only `https:` scheme.
- Resolve DNS and block:
  - IPv4 private ranges: 10/8, 172.16/12, 192.168/16, 127/8, 0.0.0.0/8, 169.254/16
  - IPv6 private/link-local: fc00::/7, fe80::/10, ::1/128
- Block cloud metadata endpoints explicitly (e.g., 169.254.169.254).
- Disable redirects (`redirect: "error"`).
- Enforce an allowlist of tool base domains per workspace.

### 15.2 Secrets handling
- CDP API key secret and wallet secret stay server-only (never `NEXT_PUBLIC_`).
- Clerk secret stays server-only.
- Fireworks API key stays server-only.
- `projectId` or other public identifiers may be client-visible, but treat them as public and rotate any secret separately.

### 15.3 Prompt injection / tool hijacking
- The Planner may propose tools, but the Executor only runs tools that pass:
  1) allowlist
  2) schema validation
  3) SSRF policy
  4) budget policy
  5) approval gates

---

## 16. Observability & evaluation (Galileo integration)

### 16.1 Why Galileo here
Paigent Studio is a reliability story; you must show:
- traces of agent decisions
- evaluation of outcomes
- regression detection across runs

Galileo provides SDKs (including TypeScript) for logging and evaluation. It uses an API key via `GALILEO_API_KEY`.

Sources:
- https://v2docs.galileo.ai/sdk-api/typescript/overview  
- https://v2docs.galileo.ai/sdk-api/typescript/logging/galileo-logger

### 16.2 What to log
- Each LLM call (prompt + response metadata)
- Tool calls (request/response metadata; scrub secrets)
- Payment attempts and receipts
- Final outcome + user feedback

---

## 17. Database migration strategy (MongoDB reality)

MongoDB doesn’t have schema migrations built in. Required approach:
- Maintain a `schema_migrations` collection with `{ version, appliedAt }`.
- Provide scripts under `scripts/migrations/` that:
  - add new indexes
  - backfill fields
  - transform documents
- Run migrations in CI/CD before enabling new app features.

---

## 18. Implementation plan (what to build first)

### Phase 0 (Day 0): Repo scaffolding
- Next.js app, shadcn/ui, Clerk
- MongoDB Atlas connection and collections + indexes
- Minimal UI shell

### Phase 1: Run creation + graph rendering
- Voice + text input
- Fireworks planner produces graph
- UI renders graph and “queued” steps

### Phase 2: Executor + resilience
- Cron tick endpoint
- step claiming + status transitions + events log
- UI shows live status updates

### Phase 3: x402 payments
- Integrate x402 fetch wrapper with server wallet signer
- Record receipts
- Budget enforcement + approval gates

### Phase 4: Bazaar discovery + retrieval
- Import Bazaar tools
- Vector search over tool docs + run history
- Adaptive retrieval loop

### Phase 5: Multi-agent polish + evaluation
- Negotiator + auditor agents
- Galileo logs + dashboards

---

## 19. Canonical documentation links (verified)

- Coinbase x402: https://docs.cdp.coinbase.com/x402/docs/http-402  
- x402 Headers FAQ: https://docs.cdp.coinbase.com/x402/support/faq  
- x402 Bazaar: https://docs.cdp.coinbase.com/x402/bazaar  
- x402 buyer quickstart: https://docs.cdp.coinbase.com/x402/quickstart-for-buyers  
- Coinbase Embedded Wallets: https://docs.cdp.coinbase.com/embedded-wallets/welcome  
- Embedded wallets + x402: https://docs.cdp.coinbase.com/embedded-wallets/x402-payments  
- CDP Server Wallet v2 quickstart: https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart  
- CDP Faucets welcome: https://docs.cdp.coinbase.com/faucets/docs/welcome  
- CDP Faucets quickstart: https://docs.cdp.coinbase.com/faucets/introduction/quickstart  
- Fireworks OpenAI compatibility: https://fireworks.ai/docs/tools-sdks/openai-compatibility  
- Fireworks querying text models: https://fireworks.ai/docs/guides/querying-text-models  
- Fireworks audio transcriptions: https://docs.fireworks.ai/api-reference/audio-transcriptions  
- MongoDB Node driver findOneAndUpdate: https://www.mongodb.com/docs/drivers/node/current/usage-examples/findOneAndUpdate/  
- MongoDB Atlas Vector Search: https://www.mongodb.com/docs/atlas/atlas-vector-search/  
- Clerk Coinbase connection: https://clerk.com/docs/guides/configure/auth-strategies/social-connections/coinbase  
- VoyageAI: https://docs.voyageai.com/docs/api-key-and-installation  
- Galileo TypeScript SDK: https://v2docs.galileo.ai/sdk-api/typescript/overview  
- NeMo Agent Toolkit: https://github.com/NVIDIA/NeMo-Agent-Toolkit  
- Thesys C1: https://docs.thesys.dev/guides/what-is-thesys-c1

---

## Appendix A — Corrected code scaffolds (TypeScript, production-grade error handling)

This appendix is intentionally small; the coding agent should generate full files. These snippets exist only to pin down tricky details.

### A.1 Safe JSON parsing helpers (planner output)

```ts
/**
 * Extract the first top-level JSON object or array from a string.
 * This is defensive against models that wrap JSON in prose or code fences.
 */
export function extractFirstJsonValue(text: string): unknown | undefined {
  const trimmed = text.trim();

  // Fast-path: already pure JSON.
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }

  // Best-effort scan for a JSON object/array using bracket balancing.
  const starts = ["{", "["] as const;
  for (const start of starts) {
    const open = start;
    const close = start === "{" ? "}" : "]";

    let depth = 0;
    let inString = false;
    let escape = false;
    let begin = -1;

    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];

      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === open) {
        if (depth === 0) begin = i;
        depth++;
      } else if (ch === close) {
        depth--;
        if (depth === 0 && begin !== -1) {
          const candidate = trimmed.slice(begin, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            begin = -1;
          }
        }
      }
    }
  }
  return undefined;
}
```

### A.2 MongoDB v6 `findOneAndUpdate` claim (returns document directly)

```ts
/**
 * Claim one queued step atomically.
 *
 * Important: In MongoDB Node.js driver v6, the default return type is a ModifyResult with metadata.
 * Setting includeResultMetadata: false returns the document directly (or null).
 *
 * Docs: https://www.mongodb.com/docs/drivers/node/current/usage-examples/findOneAndUpdate/
 */
export async function claimNextQueuedStep(params: {
  db: import("mongodb").Db;
  workspaceId: import("mongodb").ObjectId;
  workerId: string;
  now: Date;
}): Promise<import("mongodb").WithId<Record<string, unknown>> | null> {
  const { db, workspaceId, workerId, now } = params;

  const res = await db.collection("run_steps").findOneAndUpdate(
    {
      workspaceId,
      status: "queued",
      $or: [{ nextEligibleAt: { $exists: false } }, { nextEligibleAt: { $lte: now } }],
    },
    {
      $set: { status: "running", lockedBy: { workerId, lockedAt: now }, updatedAt: now },
      $inc: { attempt: 1 },
    },
    {
      sort: { updatedAt: 1 },
      returnDocument: "after",
      includeResultMetadata: false,
    }
  );

  return res; // null if none
}
```

### A.3 x402 headers (do not invent)
If you ever need to inspect raw headers, Coinbase’s x402 docs specify:

- `PAYMENT-REQUIRED` (server→client, in 402 response)
- `PAYMENT-SIGNATURE` (client→server)
- `PAYMENT-RESPONSE` (server→client)

Docs: https://docs.cdp.coinbase.com/x402/support/faq
```

