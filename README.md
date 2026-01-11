# 🌟 Paigent Studio

**Agentic Orchestration + x402 Tool Chaining on MongoDB Atlas**

Paigent Studio is a workflow IDE that enables you to design and execute multi-agent workflows with automatic micropayments. Describe what you want to accomplish using voice or text, and our AI planner creates an optimal execution graph that pays for premium tools on-demand using USDC.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-green?style=flat-square&logo=mongodb)
![Coinbase](https://img.shields.io/badge/Coinbase-CDP-0052FF?style=flat-square&logo=coinbase)

---

## ✨ Features

- **🎤 Voice-First Design** - Describe workflows using natural language or voice input
- **🤖 Multi-Agent System** - Specialized agents for planning, retrieval, negotiation, execution, and QA
- **💰 x402 Micropayments** - Pay only for tools you use with USDC via Coinbase CDP
- **📊 Real-Time Execution** - Watch workflows execute with live SSE updates
- **🔒 Enterprise Security** - SSRF protection, tool allowlisting, complete audit trails
- **🔍 Smart Tool Discovery** - VoyageAI embeddings + MongoDB Atlas Vector Search

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PAIGENT STUDIO                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │   Voice Input    │    │   Text Input     │    │   Graph Editor   │  │
│  │  (Whisper ASR)   │    │   (Natural Lang) │    │  (React Flow)    │  │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘  │
│           │                       │                       │             │
│           └───────────────────────┼───────────────────────┘             │
│                                   ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                        PLANNER AGENT                              │   │
│  │                    (GLM-4.7 Thinking Model)                       │   │
│  │     Intent → Workflow Graph (Nodes + Edges + Dependencies)        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                   │                                      │
│           ┌───────────────────────┼───────────────────────┐             │
│           ▼                       ▼                       ▼             │
│  ┌────────────────┐    ┌─────────────────┐    ┌─────────────────────┐  │
│  │   RETRIEVER    │    │   NEGOTIATOR    │    │      EXECUTOR       │  │
│  │  (Tool Search) │    │ (Payment Logic) │    │   (Step Runner)     │  │
│  │                │    │                 │    │                     │  │
│  │ VoyageAI +     │    │ Budget checks,  │    │ tool_call,          │  │
│  │ Atlas Vector   │    │ approval gates, │    │ llm_reason,         │  │
│  │ Search         │    │ pay decisions   │    │ approval, branch,   │  │
│  └────────────────┘    └─────────────────┘    │ wait, merge,        │  │
│                                               │ finalize            │  │
│                                               └─────────────────────┘  │
│                                   │                                      │
│                                   ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                         AUDITOR AGENT                             │   │
│  │              QA Review, Policy Compliance, Cost Analysis          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                           DATA LAYER                                     │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      MongoDB Atlas                                  │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │ │
│  │  │workspaces│ │  runs    │ │run_steps │ │run_events│ │ receipts │ │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────────────────────┐   │ │
│  │  │  tools   │ │artifacts │ │     Vector Search Index          │   │ │
│  │  └──────────┘ └──────────┘ └──────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                         PAYMENT LAYER                                    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                   Coinbase CDP Server Wallet v2                     │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │ │
│  │  │ Agent Wallet │  │ x402 Protocol│  │   Base Sepolia (USDC)    │ │ │
│  │  │  (Backend)   │  │  (Payments)  │  │      Testnet             │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Agent System

| Agent | Role | Model |
|-------|------|-------|
| **Planner** | Converts user intent into workflow graphs | GLM-4.7 Thinking |
| **Retriever** | Discovers relevant tools via vector search | VoyageAI + Atlas |
| **Negotiator** | Makes payment decisions based on budget/reputation | GLM-4.7 |
| **Executor** | Runs workflow steps with retry logic | - |
| **Auditor** | QA review and policy compliance checking | GLM-4.7 |

### Node Types

- `tool_call` - External API calls (may require x402 payment)
- `llm_reason` - LLM analysis, summarization, decisions
- `approval` - Human approval gate
- `branch` - Conditional branching
- `wait` - Async polling
- `merge` - Join parallel branches
- `finalize` - Produce final output

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MongoDB Atlas account
- Clerk account (authentication)
- Coinbase CDP account (payments)
- Fireworks AI account (LLM)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/paigent.git
cd paigent

# Install dependencies
npm install

# Copy environment template
cp env.example .env.local

# Start development server
npm run dev
```

### Environment Setup

Create a `.env.local` file with the following variables:

```env
# Clerk Authentication
# Get from: https://dashboard.clerk.com/
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# MongoDB Atlas
# Get from: https://cloud.mongodb.com/
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=paigent_studio

# Coinbase CDP Server Wallet
# Get from: https://portal.cdp.coinbase.com/
CDP_API_KEY_ID=your_api_key_id
CDP_API_KEY_SECRET=your_api_key_secret
CDP_WALLET_SECRET=your_wallet_secret

# Fireworks AI
# Get from: https://app.fireworks.ai/
FIREWORKS_API_KEY=fw_xxx

# VoyageAI (Optional - for vector search)
# Get from: https://dash.voyageai.com/
VOYAGE_API_KEY=

# Galileo (Optional - for observability)
# Get from: https://app.galileo.ai/
# See: https://v2docs.galileo.ai/sdk-api/typescript/sdk-reference
GALILEO_API_KEY=
GALILEO_PROJECT=paigent-studio
GALILEO_LOG_STREAM=production

# Cron Secret (generate a random string)
CRON_SECRET=your_random_secret_here
```

### Database Setup

1. Create a MongoDB Atlas cluster (M0 free tier works)
2. Create a database named `paigent_studio`
3. The collections and indexes are created automatically on first run
4. For vector search, create an Atlas Vector Search index named `tool_vector_index` on the `tools` collection

---

## 📁 Project Structure

```
src/
├── app/
│   ├── (auth)/              # Sign-in/sign-up pages
│   ├── (dashboard)/         # Authenticated dashboard pages
│   │   ├── dashboard/       # Main dashboard
│   │   ├── runs/            # Workflow runs
│   │   ├── tools/           # Tool registry
│   │   ├── wallet/          # Wallet management
│   │   ├── analytics/       # Usage analytics
│   │   └── settings/        # Workspace settings
│   └── api/                 # API routes
│       ├── runs/            # Run CRUD + events SSE
│       ├── wallet/          # Balance + faucet
│       ├── asr/             # Voice transcription
│       └── cron/            # Background execution
├── components/
│   ├── dashboard/           # Sidebar, header
│   ├── runs/                # Graph visualization, step nodes
│   └── ui/                  # shadcn/ui components
├── hooks/
│   ├── use-voice-input.ts   # Voice recording hook
│   └── use-run-events.ts    # SSE subscription hook
├── lib/
│   ├── agents/              # Multi-agent system
│   │   ├── planner.ts       # Intent → Graph
│   │   ├── executor.ts      # Step execution
│   │   ├── retriever.ts     # Tool discovery
│   │   ├── negotiator.ts    # Payment decisions
│   │   └── auditor.ts       # QA review
│   ├── cdp/                 # Coinbase CDP integration
│   │   ├── client.ts        # CDP SDK client
│   │   ├── wallet.ts        # Wallet operations
│   │   └── x402-fetch.ts    # Payment-aware fetch
│   ├── db/                  # MongoDB
│   │   ├── client.ts        # Connection
│   │   ├── collections.ts   # Schema definitions
│   │   └── queries/         # Query helpers
│   ├── fireworks/           # LLM + ASR
│   │   ├── client.ts        # OpenAI-compatible client
│   │   ├── asr.ts           # Speech-to-text
│   │   └── prompts/         # Agent prompts
│   ├── voyage/              # Embeddings
│   │   └── embeddings.ts    # VoyageAI client
│   ├── galileo/             # Observability
│   │   └── client.ts        # Trace logging
│   └── ssrf/                # Security
│       └── validator.ts     # URL validation
└── types/
    ├── database.ts          # Document schemas
    ├── graph.ts             # Workflow graph types
    └── api.ts               # API payloads
```

---

## 🔧 API Reference

### Runs

```typescript
// Create a new run
POST /api/runs
{
  "workspaceId": "string",
  "intent": "Summarize top 5 AI news articles",
  "budgetMaxAtomic": "5000000", // 5 USDC
  "autoPayEnabled": true
}

// List runs
GET /api/runs?workspaceId=xxx&status=running&page=1

// Get run details
GET /api/runs/[runId]

// Update run status
PATCH /api/runs/[runId]
{ "status": "canceled" }

// Subscribe to events (SSE)
GET /api/runs/[runId]/events
```

### Wallet

```typescript
// Get wallet balance
GET /api/wallet/balance

// Request faucet funds (testnet)
POST /api/wallet/fund
```

### Cron

```typescript
// Process queued steps (Vercel Cron)
// Vercel Cron Jobs trigger this endpoint using GET requests.
// The CRON_SECRET is automatically sent via Authorization header.
GET /api/cron/tick
Authorization: Bearer {CRON_SECRET}

// Alternative POST endpoint for manual triggering/testing
POST /api/cron/tick
Authorization: Bearer {CRON_SECRET}
```

---

## 💳 Payment Flow (x402 Protocol)

```
1. Agent calls tool endpoint
2. Tool returns 402 Payment Required + PAYMENT-REQUIRED header
3. Negotiator checks budget limits
4. CDP wallet signs EIP-3009 authorization
5. Retry request with PAYMENT-SIGNATURE header
6. Tool verifies and processes payment
7. Tool returns response + PAYMENT-RESPONSE header
8. Receipt recorded in MongoDB
```

---

## 🛡️ Security

- **SSRF Protection**: All tool URLs validated against private IP ranges and cloud metadata endpoints
- **Tool Allowlisting**: Workspace-level domain allowlist
- **Budget Controls**: Per-step and per-run spending limits
- **Approval Gates**: Human approval for high-cost or sensitive operations
- **Audit Trail**: Every action logged in `run_events` collection

---

## 📦 Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS + shadcn/ui |
| Auth | Clerk |
| Database | MongoDB Atlas |
| Vector Search | Atlas Vector Search + VoyageAI |
| LLM | Fireworks AI (GLM-4.7) |
| ASR | Fireworks Whisper |
| Payments | Coinbase CDP Server Wallet v2 |
| Real-time | Server-Sent Events |
| Deployment | Vercel |

---

## 🧪 Development

```bash
# Run development server
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint

# Build for production
npm run build
```

---

## 🚢 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import in Vercel
3. Add environment variables
4. Deploy

The `vercel.json` configures the cron job to run once daily at midnight UTC (Vercel Hobby tier limitation).

### Environment Variables on Vercel

Set all variables from `.env.local` in your Vercel project settings.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

Built for the **MongoDB AI Hackathon** with:
- [MongoDB Atlas](https://www.mongodb.com/atlas)
- [Coinbase Developer Platform](https://www.coinbase.com/developer-platform)
- [Fireworks AI](https://fireworks.ai)
- [VoyageAI](https://voyageai.com)
- [Clerk](https://clerk.com)
- [Vercel](https://vercel.com)

---

<p align="center">
  <strong>⚡ Automate with intelligence. Pay only for what you use. ⚡</strong>
</p>
