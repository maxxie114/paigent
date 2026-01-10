/**
 * API Type Definitions
 *
 * @description Type definitions for API request/response schemas.
 * Used for type-safe API routes and client-side data fetching.
 */

import { z } from "zod";
import { RunStatusSchema, StepStatusSchema, ObjectIdSchema, AtomicAmountSchema } from "./database";
import { RunGraph } from "./graph";

// =============================================================================
// Common API Types
// =============================================================================

/**
 * Pagination parameters schema.
 */
export const PaginationParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationParams = z.infer<typeof PaginationParamsSchema>;

/**
 * Generic API success response.
 */
export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
};

/**
 * Generic API error response.
 */
export type ApiErrorResponse = {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
};

/**
 * Generic API response type.
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// =============================================================================
// Run API Types
// =============================================================================

/**
 * Create run request schema.
 */
export const CreateRunRequestSchema = z.object({
  workspaceId: ObjectIdSchema,
  intent: z.string().min(1).max(10000),
  voiceTranscript: z.string().optional(),
  budgetMaxAtomic: AtomicAmountSchema.optional(),
});

export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;

/**
 * Create run response.
 */
export type CreateRunResponse = {
  runId: string;
  status: string;
  graph: RunGraph;
};

/**
 * Get run response.
 */
export type GetRunResponse = {
  id: string;
  workspaceId: string;
  status: string;
  input: {
    text: string;
    voiceTranscript?: string;
  };
  graph: RunGraph;
  budget: {
    asset: string;
    network: string;
    maxAtomic: string;
    spentAtomic: string;
  };
  createdAt: string;
  updatedAt: string;
};

/**
 * List runs response.
 */
export type ListRunsResponse = {
  runs: Array<{
    id: string;
    status: string;
    input: { text: string };
    budget: { spentAtomic: string; maxAtomic: string };
    createdAt: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

/**
 * Update run status request schema.
 */
export const UpdateRunStatusRequestSchema = z.object({
  status: RunStatusSchema,
});

export type UpdateRunStatusRequest = z.infer<typeof UpdateRunStatusRequestSchema>;

// =============================================================================
// Step API Types
// =============================================================================

/**
 * Get steps response.
 */
export type GetStepsResponse = {
  steps: Array<{
    id: string;
    stepId: string;
    nodeType: string;
    status: string;
    attempt: number;
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    error?: { code: string; message: string };
    metrics?: { latencyMs?: number; costAtomic?: string };
    createdAt: string;
    updatedAt: string;
  }>;
};

/**
 * Approve step request schema.
 */
export const ApproveStepRequestSchema = z.object({
  approved: z.boolean(),
  enableAutoPayForSession: z.boolean().optional(),
});

export type ApproveStepRequest = z.infer<typeof ApproveStepRequestSchema>;

// =============================================================================
// Event API Types
// =============================================================================

/**
 * SSE event data structure.
 */
export type SSEEventData = {
  id: string;
  type: string;
  ts: string;
  data: Record<string, unknown>;
  actor: {
    type: "system" | "agent" | "user";
    id: string;
  };
};

/**
 * Get events response.
 */
export type GetEventsResponse = {
  events: SSEEventData[];
};

// =============================================================================
// Wallet API Types
// =============================================================================

/**
 * Get wallet balance response.
 */
export type GetWalletBalanceResponse = {
  address: string;
  network: string;
  balances: {
    eth: string;
    usdc: string;
  };
};

/**
 * Fund wallet response.
 */
export type FundWalletResponse = {
  success: boolean;
  ethTxHash?: string;
  usdcTxHash?: string;
  error?: string;
};

// =============================================================================
// Tool API Types
// =============================================================================

/**
 * Create tool request schema.
 */
export const CreateToolRequestSchema = z.object({
  workspaceId: ObjectIdSchema,
  source: z.enum(["bazaar", "manual"]),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  baseUrl: z.string().url(),
  endpoints: z.array(
    z.object({
      path: z.string().min(1),
      method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
      description: z.string().optional(),
    })
  ),
});

export type CreateToolRequest = z.infer<typeof CreateToolRequestSchema>;

/**
 * Get tool response.
 */
export type GetToolResponse = {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  endpoints: Array<{
    path: string;
    method: string;
    description?: string;
  }>;
  reputation: {
    successRate: number;
    avgLatencyMs: number;
    disputeRate: number;
  };
  pricingHints?: {
    typicalAmountAtomic?: string;
  };
};

/**
 * List tools response.
 */
export type ListToolsResponse = {
  tools: GetToolResponse[];
  total: number;
};

// =============================================================================
// ASR API Types
// =============================================================================

/**
 * Transcribe response.
 */
export type TranscribeResponse = {
  transcript: string;
  confidence?: number;
  duration?: number;
};

// =============================================================================
// Budget API Types
// =============================================================================

/**
 * Get budget summary response.
 */
export type GetBudgetSummaryResponse = {
  workspaceId: string;
  totalSpentAtomic: string;
  receiptCount: number;
  byTool: Array<{
    toolId: string;
    toolName?: string;
    totalAtomic: string;
    count: number;
  }>;
};

/**
 * Get receipts response.
 */
export type GetReceiptsResponse = {
  receipts: Array<{
    id: string;
    runId: string;
    stepId: string;
    network: string;
    asset: string;
    amountAtomic: string;
    status: string;
    txHash?: string;
    createdAt: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
};

// =============================================================================
// Workspace API Types
// =============================================================================

/**
 * Create workspace request schema.
 */
export const CreateWorkspaceRequestSchema = z.object({
  name: z.string().min(1).max(100),
});

export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>;

/**
 * Get workspace response.
 */
export type GetWorkspaceResponse = {
  id: string;
  name: string;
  settings: {
    autoPayEnabled: boolean;
    autoPayMaxPerStepAtomic: string;
    autoPayMaxPerRunAtomic: string;
    toolAllowlist: string[];
  };
  createdAt: string;
};

/**
 * Update workspace settings request schema.
 */
export const UpdateWorkspaceSettingsRequestSchema = z.object({
  autoPayEnabled: z.boolean().optional(),
  autoPayMaxPerStepAtomic: AtomicAmountSchema.optional(),
  autoPayMaxPerRunAtomic: AtomicAmountSchema.optional(),
  toolAllowlist: z.array(z.string().url()).optional(),
});

export type UpdateWorkspaceSettingsRequest = z.infer<
  typeof UpdateWorkspaceSettingsRequestSchema
>;
