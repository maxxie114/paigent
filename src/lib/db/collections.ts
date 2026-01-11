import { Collection, ObjectId, Db } from "mongodb";
import { getDb } from "./client";

/**
 * MongoDB Document Types
 *
 * @description Type definitions for all MongoDB collections in the Paigent database.
 * These types match the schema defined in the spec (Section 7.2).
 */

// =============================================================================
// Workspace Types
// =============================================================================

/**
 * Workspace settings configuration.
 */
export type WorkspaceSettings = {
  /** Whether auto-pay is enabled for this workspace. */
  autoPayEnabled: boolean;
  /** Maximum payment per step in atomic USDC units (6 decimals). */
  autoPayMaxPerStepAtomic: string;
  /** Maximum payment per run in atomic USDC units. */
  autoPayMaxPerRunAtomic: string;
  /** List of allowed tool base URLs. */
  toolAllowlist: string[];
};

/**
 * Workspace document structure.
 */
export type WorkspaceDocument = {
  _id: ObjectId;
  /** Human-readable workspace name. */
  name: string;
  /** Workspace creation timestamp. */
  createdAt: Date;
  /** Workspace settings. */
  settings: WorkspaceSettings;
};

// =============================================================================
// Workspace Member Types
// =============================================================================

/**
 * Role types for workspace members.
 */
export type WorkspaceMemberRole = "owner" | "admin" | "member" | "viewer";

/**
 * Workspace member document structure.
 */
export type WorkspaceMemberDocument = {
  _id: ObjectId;
  /** Reference to the workspace. */
  workspaceId: ObjectId;
  /** Clerk user ID. */
  clerkUserId: string;
  /** Member's role in the workspace. */
  role: WorkspaceMemberRole;
  /** Membership creation timestamp. */
  createdAt: Date;
};

// =============================================================================
// Tool Types
// =============================================================================

/**
 * Tool source type.
 */
export type ToolSource = "bazaar" | "manual";

/**
 * Tool endpoint descriptor.
 */
export type ToolEndpoint = {
  /** Endpoint path (e.g., "/api/analyze"). */
  path: string;
  /** HTTP method. */
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** Description of what this endpoint does. */
  description?: string;
  /** JSON schema for request body. */
  requestSchema?: Record<string, unknown>;
  /** JSON schema for response body. */
  responseSchema?: Record<string, unknown>;
};

/**
 * Tool reputation metrics.
 */
export type ToolReputation = {
  /** Success rate (0-1). */
  successRate: number;
  /** Average latency in milliseconds. */
  avgLatencyMs: number;
  /** Dispute rate (0-1). */
  disputeRate: number;
  /** Last verification timestamp. */
  lastVerifiedAt: Date | undefined;
};

/**
 * Tool pricing hints from 402 responses.
 */
export type ToolPricingHints = {
  /** Typical price in atomic USDC. */
  typicalAmountAtomic?: string;
  /** Network for payments. */
  network?: string;
  /** Asset address. */
  asset?: string;
};

/**
 * Tool document structure.
 */
export type ToolDocument = {
  _id: ObjectId;
  /** Reference to the workspace. */
  workspaceId: ObjectId;
  /** Tool source. */
  source: ToolSource;
  /** Tool name. */
  name: string;
  /** Tool description. */
  description: string;
  /** Base URL for the tool. */
  baseUrl: string;
  /** Available endpoints. */
  endpoints: ToolEndpoint[];
  /** Reputation metrics. */
  reputation: ToolReputation;
  /** Pricing hints from last 402 response. */
  pricingHints?: ToolPricingHints;
  /**
   * Vector embedding for semantic search.
   *
   * @description Generated using VoyageAI embeddings for tool discovery
   * via MongoDB Atlas Vector Search.
   *
   * Default dimension is 1024 using voyage-3-large model.
   * Compatible with flexible dimensions (2048, 1024, 512, 256) if configured.
   */
  embedding?: number[];
  /** Creation timestamp. */
  createdAt: Date;
  /** Last update timestamp. */
  updatedAt: Date;
};

// =============================================================================
// Run Types
// =============================================================================

/**
 * Run status enum.
 */
export type RunStatus =
  | "draft"
  | "queued"
  | "running"
  | "paused_for_approval"
  | "succeeded"
  | "failed"
  | "canceled";

/**
 * Run input data.
 */
export type RunInput = {
  /** Text input from user. */
  text: string;
  /** Voice transcript (if voice input was used). */
  voiceTranscript?: string;
  /** Attached files or references. */
  attachments?: string[];
};

/**
 * Run budget configuration.
 */
export type RunBudget = {
  /** Asset type (always "USDC" for MVP). */
  asset: "USDC";
  /** Network in CAIP-2 format (e.g., "eip155:84532" for Base Sepolia). */
  network: string;
  /** Maximum budget in atomic units. */
  maxAtomic: string;
  /** Amount spent so far in atomic units. */
  spentAtomic: string;
};

/**
 * Run graph structure (stored as snapshot).
 */
export type RunGraph = {
  /** Graph nodes. */
  nodes: RunGraphNode[];
  /** Graph edges. */
  edges: RunGraphEdge[];
  /** Entry node ID. */
  entryNodeId: string;
};

/**
 * Node types in the run graph.
 */
export type NodeType =
  | "tool_call"
  | "llm_reason"
  | "approval"
  | "branch"
  | "wait"
  | "merge"
  | "finalize";

/**
 * Node policy configuration.
 */
export type NodePolicy = {
  /** Whether this node requires user approval. */
  requiresApproval?: boolean;
  /** Maximum retry attempts. */
  maxRetries?: number;
  /** Timeout in milliseconds. */
  timeoutMs?: number;
};

/**
 * Base node structure.
 */
export type RunGraphNode = {
  /** Unique node ID. */
  id: string;
  /** Node type. */
  type: NodeType;
  /** Human-readable label. */
  label: string;
  /** Explicit dependencies (node IDs). */
  dependsOn?: string[];
  /** Node execution policy. */
  policy?: NodePolicy;
  /** Tool ID for tool_call nodes. */
  toolId?: string;
  /** Endpoint configuration for tool_call nodes. */
  endpoint?: {
    path: string;
    method: string;
  };
  /** Request template for tool_call nodes. */
  requestTemplate?: Record<string, unknown>;
  /** Payment configuration for tool_call nodes. */
  payment?: {
    allowed: boolean;
    maxAtomic?: string;
  };
};

/**
 * Edge type in the run graph.
 */
export type EdgeType = "success" | "failure" | "conditional";

/**
 * Graph edge structure.
 */
export type RunGraphEdge = {
  /** Source node ID. */
  from: string;
  /** Target node ID. */
  to: string;
  /** Edge type. */
  type: EdgeType;
  /** Condition expression for conditional edges. */
  condition?: string;
};

/**
 * Run document structure.
 */
export type RunDocument = {
  _id: ObjectId;
  /** Reference to the workspace. */
  workspaceId: ObjectId;
  /** Clerk user ID of creator. */
  createdByClerkUserId: string;
  /** Current run status. */
  status: RunStatus;
  /** User input that started this run. */
  input: RunInput;
  /** Immutable graph snapshot. */
  graph: RunGraph;
  /** Budget configuration. */
  budget: RunBudget;
  /** Auto-pay policy snapshot from workspace at run start. */
  autoPayPolicy: WorkspaceSettings;
  /** Creation timestamp. */
  createdAt: Date;
  /** Last update timestamp. */
  updatedAt: Date;
  /** Last heartbeat from executor. */
  lastHeartbeatAt?: Date;
};

// =============================================================================
// Run Step Types
// =============================================================================

/**
 * Step status enum.
 */
export type StepStatus = "queued" | "running" | "succeeded" | "failed" | "blocked";

/**
 * Step lock information for distributed execution.
 */
export type StepLock = {
  /** Worker ID that holds the lock. */
  workerId: string;
  /** When the lock was acquired. */
  lockedAt: Date;
};

/**
 * Normalized error structure.
 */
export type StepError = {
  /** Error code or type. */
  code: string;
  /** Human-readable message. */
  message: string;
  /** Stack trace (if available). */
  stack?: string;
  /** Additional context. */
  context?: Record<string, unknown>;
};

/**
 * Step metrics.
 */
export type StepMetrics = {
  /** Execution latency in milliseconds. */
  latencyMs?: number;
  /** Tokens used (for LLM steps). */
  tokens?: {
    input: number;
    output: number;
  };
  /** Cost in atomic USDC (if payment was made). */
  costAtomic?: string;
};

/**
 * Run step document structure (materialized state).
 */
export type RunStepDocument = {
  _id: ObjectId;
  /** Reference to the workspace. */
  workspaceId: ObjectId;
  /** Reference to the run. */
  runId: ObjectId;
  /** Stable step ID within the run (matches node ID). */
  stepId: string;
  /** Node type. */
  nodeType: NodeType;
  /** Current status. */
  status: StepStatus;
  /** Execution attempt number (starts at 0). */
  attempt: number;
  /** Lock information for distributed execution. */
  lockedBy?: StepLock;
  /** Sanitized input data. */
  inputs?: Record<string, unknown>;
  /** Output data or reference to step_artifacts. */
  outputs?: Record<string, unknown>;
  /** Error information (if failed). */
  error?: StepError;
  /** Execution metrics. */
  metrics?: StepMetrics;
  /** Next eligible execution time (for backoff). */
  nextEligibleAt?: Date;
  /** Creation timestamp. */
  createdAt: Date;
  /** Last update timestamp. */
  updatedAt: Date;
};

// =============================================================================
// Run Event Types
// =============================================================================

/**
 * Event types for the append-only audit log.
 */
export type RunEventType =
  | "RUN_CREATED"
  | "RUN_PLANNING_FAILED"
  | "RUN_STARTED"
  | "RUN_PAUSED"
  | "RUN_RESUMED"
  | "RUN_SUCCEEDED"
  | "RUN_FAILED"
  | "RUN_CANCELED"
  | "STEPS_EXECUTED"
  | "STEP_CLAIMED"
  | "STEP_STARTED"
  | "STEP_SUCCEEDED"
  | "STEP_FAILED"
  | "STEP_RETRY_SCHEDULED"
  | "STEP_BLOCKED"
  | "STEP_APPROVED"
  | "STEP_REJECTED"
  | "402_RECEIVED"
  | "PAYMENT_SENT"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_FAILED"
  | "AUDIT_COMPLETE";

/**
 * Actor who triggered the event.
 */
export type EventActor =
  | { type: "system"; id: string }
  | { type: "agent"; id: string }
  | { type: "user"; id: string };

/**
 * Run event document structure (append-only).
 */
export type RunEventDocument = {
  _id: ObjectId;
  /** Reference to the workspace. */
  workspaceId: ObjectId;
  /** Reference to the run. */
  runId: ObjectId;
  /** Event type. */
  type: RunEventType;
  /** Event timestamp. */
  ts: Date;
  /** Event payload. */
  data: Record<string, unknown>;
  /** Actor who triggered the event. */
  actor: EventActor;
};

// =============================================================================
// Payment Receipt Types
// =============================================================================

/**
 * Payment status.
 */
export type PaymentStatus = "settled" | "rejected" | "unknown";

/**
 * Payment receipt document structure.
 */
export type PaymentReceiptDocument = {
  _id: ObjectId;
  /** Reference to the workspace. */
  workspaceId: ObjectId;
  /** Reference to the run. */
  runId: ObjectId;
  /** Reference to the step. */
  stepId: string;
  /** Reference to the tool. */
  toolId?: ObjectId;
  /** Network in CAIP-2 format. */
  network: string;
  /** Asset address. */
  asset: string;
  /** Amount in atomic units. */
  amountAtomic: string;
  /** Base64-encoded PAYMENT-REQUIRED header. */
  paymentRequiredHeaderB64: string;
  /** Base64-encoded PAYMENT-SIGNATURE header. */
  paymentSignatureHeaderB64?: string;
  /** PAYMENT-RESPONSE header value. */
  paymentResponseHeader?: string;
  /** Transaction hash (if known). */
  txHash?: string;
  /** Payment status. */
  status: PaymentStatus;
  /** Creation timestamp. */
  createdAt: Date;
};

// =============================================================================
// Step Artifact Types
// =============================================================================

/**
 * Artifact kind.
 */
export type ArtifactKind = "tool_response" | "transcript" | "summary" | "debug";

/**
 * Step artifact document structure.
 */
export type StepArtifactDocument = {
  _id: ObjectId;
  /** Reference to the workspace. */
  workspaceId: ObjectId;
  /** Reference to the run. */
  runId: ObjectId;
  /** Reference to the step. */
  stepId: string;
  /** Artifact kind. */
  kind: ArtifactKind;
  /** Artifact payload. */
  blob: unknown;
  /** Creation timestamp. */
  createdAt: Date;
};

// =============================================================================
// Context Envelope Types
// =============================================================================

/**
 * Context envelope for agent communication.
 */
export type ContextEnvelopeDocument = {
  _id: ObjectId;
  /** Reference to the run. */
  runId: ObjectId;
  /** Agent that created this envelope. */
  agent: string;
  /** Compressed summary of context. */
  summary: string;
  /** References to relevant artifacts. */
  relevantArtifacts: ObjectId[];
  /** Pointers to other envelopes. */
  pointers: ObjectId[];
  /** Creation timestamp. */
  createdAt: Date;
};

// =============================================================================
// Schema Migration Types
// =============================================================================

/**
 * Schema migration tracking document.
 */
export type SchemaMigrationDocument = {
  _id: ObjectId;
  /** Migration version number. */
  version: number;
  /** When the migration was applied. */
  appliedAt: Date;
  /** Description of the migration. */
  description?: string;
};

// =============================================================================
// Collection Accessors
// =============================================================================

/**
 * Get type-safe collection accessor.
 *
 * @description Returns a typed MongoDB collection instance.
 *
 * @param db - Database instance.
 * @param name - Collection name.
 * @returns Typed collection instance.
 */
function collection<T extends Record<string, unknown>>(
  db: Db,
  name: string
): Collection<T> {
  return db.collection<T>(name);
}

/**
 * Collection accessor functions.
 *
 * @description Provides type-safe access to all Paigent collections.
 */
export const collections = {
  /**
   * Get the workspaces collection.
   */
  workspaces: async (): Promise<Collection<WorkspaceDocument>> => {
    const db = await getDb();
    return collection<WorkspaceDocument>(db, "workspaces");
  },

  /**
   * Get the workspace_members collection.
   */
  workspaceMembers: async (): Promise<Collection<WorkspaceMemberDocument>> => {
    const db = await getDb();
    return collection<WorkspaceMemberDocument>(db, "workspace_members");
  },

  /**
   * Get the tools collection.
   */
  tools: async (): Promise<Collection<ToolDocument>> => {
    const db = await getDb();
    return collection<ToolDocument>(db, "tools");
  },

  /**
   * Get the runs collection.
   */
  runs: async (): Promise<Collection<RunDocument>> => {
    const db = await getDb();
    return collection<RunDocument>(db, "runs");
  },

  /**
   * Get the run_steps collection.
   */
  runSteps: async (): Promise<Collection<RunStepDocument>> => {
    const db = await getDb();
    return collection<RunStepDocument>(db, "run_steps");
  },

  /**
   * Get the run_events collection.
   */
  runEvents: async (): Promise<Collection<RunEventDocument>> => {
    const db = await getDb();
    return collection<RunEventDocument>(db, "run_events");
  },

  /**
   * Get the payment_receipts collection.
   */
  paymentReceipts: async (): Promise<Collection<PaymentReceiptDocument>> => {
    const db = await getDb();
    return collection<PaymentReceiptDocument>(db, "payment_receipts");
  },

  /**
   * Get the step_artifacts collection.
   */
  stepArtifacts: async (): Promise<Collection<StepArtifactDocument>> => {
    const db = await getDb();
    return collection<StepArtifactDocument>(db, "step_artifacts");
  },

  /**
   * Get the context_envelopes collection.
   */
  contextEnvelopes: async (): Promise<Collection<ContextEnvelopeDocument>> => {
    const db = await getDb();
    return collection<ContextEnvelopeDocument>(db, "context_envelopes");
  },

  /**
   * Get the schema_migrations collection.
   */
  schemaMigrations: async (): Promise<Collection<SchemaMigrationDocument>> => {
    const db = await getDb();
    return collection<SchemaMigrationDocument>(db, "schema_migrations");
  },
};
