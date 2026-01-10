/**
 * Database Document Zod Schemas
 *
 * @description Zod validation schemas for all MongoDB document types.
 * Used for runtime validation of API inputs and LLM outputs.
 *
 * @see paigent-studio-spec.md Section 7.2 for collection definitions
 */

import { z } from "zod";

// =============================================================================
// Primitive Schemas
// =============================================================================

/**
 * MongoDB ObjectId string validation.
 * Accepts 24-character hex strings.
 */
export const ObjectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid ObjectId format");

/**
 * Atomic amount in string format (to handle large numbers).
 * USDC has 6 decimals, so 1 USDC = 1000000 atomic units.
 */
export const AtomicAmountSchema = z.string().regex(/^\d+$/, "Must be a non-negative integer string");

/**
 * CAIP-2 network identifier.
 * Format: namespace:reference (e.g., "eip155:84532" for Base Sepolia)
 */
export const NetworkSchema = z.string().regex(/^[a-z0-9]+:[a-zA-Z0-9]+$/, "Invalid CAIP-2 network format");

// =============================================================================
// Workspace Schemas
// =============================================================================

/**
 * Workspace settings schema.
 */
export const WorkspaceSettingsSchema = z.object({
  /** Whether auto-pay is enabled for this workspace. */
  autoPayEnabled: z.boolean().default(false),
  /** Maximum payment per step in atomic USDC units. */
  autoPayMaxPerStepAtomic: AtomicAmountSchema.default("1000000"),
  /** Maximum payment per run in atomic USDC units. */
  autoPayMaxPerRunAtomic: AtomicAmountSchema.default("10000000"),
  /** List of allowed tool base URLs. */
  toolAllowlist: z.array(z.string().url()).default([]),
});

export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;

/**
 * Workspace creation input schema.
 */
export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  settings: WorkspaceSettingsSchema.partial().optional(),
});

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;

/**
 * Workspace member role schema.
 */
export const WorkspaceMemberRoleSchema = z.enum(["owner", "admin", "member", "viewer"]);

export type WorkspaceMemberRole = z.infer<typeof WorkspaceMemberRoleSchema>;

// =============================================================================
// Tool Schemas
// =============================================================================

/**
 * Tool source schema.
 */
export const ToolSourceSchema = z.enum(["bazaar", "manual"]);

export type ToolSource = z.infer<typeof ToolSourceSchema>;

/**
 * HTTP method schema.
 */
export const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]);

export type HttpMethod = z.infer<typeof HttpMethodSchema>;

/**
 * Tool endpoint schema.
 */
export const ToolEndpointSchema = z.object({
  path: z.string().min(1),
  method: HttpMethodSchema,
  description: z.string().optional(),
  requestSchema: z.record(z.unknown()).optional(),
  responseSchema: z.record(z.unknown()).optional(),
});

export type ToolEndpoint = z.infer<typeof ToolEndpointSchema>;

/**
 * Tool reputation schema.
 */
export const ToolReputationSchema = z.object({
  successRate: z.number().min(0).max(1),
  avgLatencyMs: z.number().min(0),
  disputeRate: z.number().min(0).max(1),
  lastVerifiedAt: z.date().nullable().optional(),
});

export type ToolReputation = z.infer<typeof ToolReputationSchema>;

/**
 * Tool pricing hints schema.
 */
export const ToolPricingHintsSchema = z.object({
  typicalAmountAtomic: AtomicAmountSchema.optional(),
  network: NetworkSchema.optional(),
  asset: z.string().optional(),
});

export type ToolPricingHints = z.infer<typeof ToolPricingHintsSchema>;

/**
 * Tool creation input schema.
 */
export const CreateToolSchema = z.object({
  source: ToolSourceSchema,
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  baseUrl: z.string().url(),
  endpoints: z.array(ToolEndpointSchema).min(1),
  reputation: ToolReputationSchema.optional(),
  pricingHints: ToolPricingHintsSchema.optional(),
});

export type CreateToolInput = z.infer<typeof CreateToolSchema>;

// =============================================================================
// Run Schemas
// =============================================================================

/**
 * Run status schema.
 */
export const RunStatusSchema = z.enum([
  "draft",
  "queued",
  "running",
  "paused_for_approval",
  "succeeded",
  "failed",
  "canceled",
]);

export type RunStatus = z.infer<typeof RunStatusSchema>;

/**
 * Run input schema.
 */
export const RunInputSchema = z.object({
  text: z.string().min(1).max(10000),
  voiceTranscript: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

export type RunInput = z.infer<typeof RunInputSchema>;

/**
 * Run budget schema.
 */
export const RunBudgetSchema = z.object({
  asset: z.literal("USDC"),
  network: NetworkSchema,
  maxAtomic: AtomicAmountSchema,
  spentAtomic: AtomicAmountSchema,
});

export type RunBudget = z.infer<typeof RunBudgetSchema>;

/**
 * Run creation input schema.
 */
export const CreateRunSchema = z.object({
  workspaceId: ObjectIdSchema,
  intent: z.string().min(1).max(10000),
  voiceTranscript: z.string().optional(),
  budget: z
    .object({
      maxAtomic: AtomicAmountSchema,
    })
    .optional(),
});

export type CreateRunInput = z.infer<typeof CreateRunSchema>;

// =============================================================================
// Step Schemas
// =============================================================================

/**
 * Step status schema.
 */
export const StepStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "blocked"]);

export type StepStatus = z.infer<typeof StepStatusSchema>;

/**
 * Normalized error schema.
 */
export const StepErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  stack: z.string().optional(),
  context: z.record(z.unknown()).optional(),
});

export type StepError = z.infer<typeof StepErrorSchema>;

// =============================================================================
// Event Schemas
// =============================================================================

/**
 * Run event type schema.
 */
export const RunEventTypeSchema = z.enum([
  "RUN_CREATED",
  "RUN_STARTED",
  "RUN_PAUSED",
  "RUN_RESUMED",
  "RUN_SUCCEEDED",
  "RUN_FAILED",
  "RUN_CANCELED",
  "STEP_CLAIMED",
  "STEP_STARTED",
  "STEP_SUCCEEDED",
  "STEP_FAILED",
  "STEP_RETRY_SCHEDULED",
  "STEP_BLOCKED",
  "STEP_APPROVED",
  "STEP_REJECTED",
  "402_RECEIVED",
  "PAYMENT_SENT",
  "PAYMENT_CONFIRMED",
  "PAYMENT_FAILED",
  "AUDIT_COMPLETE",
]);

export type RunEventType = z.infer<typeof RunEventTypeSchema>;

/**
 * Event actor schema.
 */
export const EventActorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("system"), id: z.string() }),
  z.object({ type: z.literal("agent"), id: z.string() }),
  z.object({ type: z.literal("user"), id: z.string() }),
]);

export type EventActor = z.infer<typeof EventActorSchema>;

// =============================================================================
// Payment Schemas
// =============================================================================

/**
 * Payment status schema.
 */
export const PaymentStatusSchema = z.enum(["settled", "rejected", "unknown"]);

export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

/**
 * Payment approval input schema.
 */
export const PaymentApprovalSchema = z.object({
  runId: ObjectIdSchema,
  stepId: z.string(),
  approved: z.boolean(),
  enableAutoPayForSession: z.boolean().optional(),
});

export type PaymentApprovalInput = z.infer<typeof PaymentApprovalSchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Generic API error response schema.
 */
export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Paginated response schema factory.
 */
export function paginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
    hasMore: z.boolean(),
  });
}
