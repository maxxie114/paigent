/**
 * Agent Type Definitions
 *
 * @description Type definitions for the multi-agent orchestration system.
 * Includes agent roles, context envelopes, and decision schemas.
 *
 * @see paigent-studio-spec.md Section 12 for orchestrator architecture
 */

import { z } from "zod";
import { AtomicAmountSchema, ToolReputationSchema } from "./database";

// =============================================================================
// Agent Roles
// =============================================================================

/**
 * Agent role enum.
 */
export const AgentRoleSchema = z.enum([
  "planner",
  "retriever",
  "negotiator",
  "executor",
  "auditor",
]);

export type AgentRole = z.infer<typeof AgentRoleSchema>;

// =============================================================================
// Context Envelope Types
// =============================================================================

/**
 * Context envelope schema.
 * Compressed summary of history for agent communication.
 */
export const ContextEnvelopeSchema = z.object({
  /** Reference to the run. */
  runId: z.string(),
  /** Agent that created this envelope. */
  agent: AgentRoleSchema,
  /** Compressed summary of context. */
  summary: z.string(),
  /** References to relevant artifact IDs. */
  relevantArtifacts: z.array(z.string()),
  /** Pointers to other envelope IDs. */
  pointers: z.array(z.string()),
  /** Creation timestamp. */
  createdAt: z.date(),
});

export type ContextEnvelope = z.infer<typeof ContextEnvelopeSchema>;

// =============================================================================
// Planner Agent Types
// =============================================================================

/**
 * Planner input schema.
 */
export const PlannerInputSchema = z.object({
  /** User's intent or goal. */
  intent: z.string(),
  /** Available tools for the workflow. */
  availableTools: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      baseUrl: z.string(),
      endpoints: z.array(
        z.object({
          path: z.string(),
          method: z.string(),
          description: z.string().optional(),
        })
      ),
      pricingHints: z
        .object({
          typicalAmountAtomic: z.string().optional(),
        })
        .optional(),
    })
  ),
  /** Whether auto-pay is enabled. */
  autoPayEnabled: z.boolean(),
  /** Maximum budget in atomic units. */
  maxBudgetAtomic: z.string(),
});

export type PlannerInput = z.infer<typeof PlannerInputSchema>;

/**
 * Planner output schema.
 */
export const PlannerOutputSchema = z.object({
  /** The generated workflow graph. */
  graph: z.unknown(), // Will be validated by RunGraphSchema
  /** Reasoning for the plan. */
  reasoning: z.string().optional(),
  /** Estimated cost in atomic units. */
  estimatedCostAtomic: z.string().optional(),
  /** Confidence score (0-1). */
  confidence: z.number().min(0).max(1).optional(),
});

export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

// =============================================================================
// Negotiator Agent Types
// =============================================================================

/**
 * Negotiation decision enum.
 */
export const NegotiationDecisionSchema = z.enum([
  "PAY",
  "SKIP",
  "ASK_APPROVAL",
  "NEGOTIATE",
]);

export type NegotiationDecision = z.infer<typeof NegotiationDecisionSchema>;

/**
 * Negotiator input schema.
 */
export const NegotiatorInputSchema = z.object({
  /** Tool name for display. */
  toolName: z.string(),
  /** Required payment amount in atomic units. */
  amountAtomic: AtomicAmountSchema,
  /** Remaining budget in atomic units. */
  budgetRemaining: AtomicAmountSchema,
  /** Auto-pay policy configuration. */
  autoPayPolicy: z.object({
    autoPayEnabled: z.boolean(),
    autoPayMaxPerStepAtomic: AtomicAmountSchema,
    autoPayMaxPerRunAtomic: AtomicAmountSchema,
  }),
  /** Tool's reputation metrics. */
  toolReputation: ToolReputationSchema,
  /** Value assessment of the tool output. */
  valueAssessment: z.string().optional(),
});

export type NegotiatorInput = z.infer<typeof NegotiatorInputSchema>;

/**
 * Negotiator output schema.
 */
export const NegotiatorOutputSchema = z.object({
  /** Decision on how to handle the payment. */
  decision: NegotiationDecisionSchema,
  /** Reason for the decision. */
  reason: z.string(),
  /** Counter-offer amount (if negotiating). */
  counterOfferAtomic: AtomicAmountSchema.optional(),
});

export type NegotiatorOutput = z.infer<typeof NegotiatorOutputSchema>;

// =============================================================================
// Retriever Agent Types
// =============================================================================

/**
 * Retrieval result schema.
 */
export const RetrievalResultSchema = z.object({
  /** Tool ID. */
  toolId: z.string(),
  /** Tool name. */
  name: z.string(),
  /** Tool description. */
  description: z.string(),
  /** Relevance score (0-1). */
  score: z.number().min(0).max(1),
  /** Match reason. */
  matchReason: z.string().optional(),
});

export type RetrievalResult = z.infer<typeof RetrievalResultSchema>;

/**
 * Retrieval critique schema.
 */
export const RetrievalCritiqueSchema = z.object({
  /** Whether results are sufficient. */
  sufficient: z.boolean(),
  /** Coverage assessment. */
  coverage: z.string(),
  /** Diversity assessment. */
  diversity: z.string(),
  /** Suggested refined query. */
  refinedQuery: z.string(),
  /** Missing capabilities. */
  missingCapabilities: z.array(z.string()),
});

export type RetrievalCritique = z.infer<typeof RetrievalCritiqueSchema>;

// =============================================================================
// Auditor Agent Types
// =============================================================================

/**
 * Audit report schema.
 */
export const AuditReportSchema = z.object({
  /** Overall success assessment. */
  overallSuccess: z.boolean(),
  /** Success score (0-1). */
  successScore: z.number().min(0).max(1),
  /** Policy violations found. */
  policyViolations: z.array(
    z.object({
      policy: z.string(),
      violation: z.string(),
      severity: z.enum(["low", "medium", "high", "critical"]),
    })
  ),
  /** Cost efficiency analysis. */
  costEfficiency: z.object({
    totalSpentAtomic: z.string(),
    budgetUtilization: z.number().min(0).max(1),
    assessment: z.string(),
  }),
  /** Recommendations for future runs. */
  recommendations: z.array(z.string()),
  /** Data provenance summary. */
  dataProvenance: z.object({
    sourcesUsed: z.array(z.string()),
    toolsInvoked: z.array(z.string()),
    externalDataAccessed: z.boolean(),
  }),
  /** Summary text. */
  summary: z.string(),
});

export type AuditReport = z.infer<typeof AuditReportSchema>;

// =============================================================================
// Executor Types
// =============================================================================

/**
 * Step execution result schema.
 */
export const StepExecutionResultSchema = z.object({
  /** Execution status. */
  status: z.enum(["succeeded", "failed", "retrying", "blocked"]),
  /** Result data (if succeeded). */
  result: z.unknown().optional(),
  /** Error information (if failed or retrying). */
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      stack: z.string().optional(),
    })
    .optional(),
  /** Metrics. */
  metrics: z
    .object({
      latencyMs: z.number(),
      tokensUsed: z.number().optional(),
      costAtomic: z.string().optional(),
    })
    .optional(),
});

export type StepExecutionResult = z.infer<typeof StepExecutionResultSchema>;

// =============================================================================
// LLM Response Types
// =============================================================================

/**
 * LLM call metadata schema.
 */
export const LLMCallMetadataSchema = z.object({
  /** Model used. */
  model: z.string(),
  /** Input tokens. */
  inputTokens: z.number(),
  /** Output tokens. */
  outputTokens: z.number(),
  /** Latency in milliseconds. */
  latencyMs: z.number(),
  /** Finish reason. */
  finishReason: z.string().optional(),
});

export type LLMCallMetadata = z.infer<typeof LLMCallMetadataSchema>;

/**
 * LLM response wrapper schema.
 */
export const LLMResponseSchema = z.object({
  /** Raw text response. */
  text: z.string(),
  /** Parsed JSON (if applicable). */
  parsed: z.unknown().optional(),
  /** Call metadata. */
  metadata: LLMCallMetadataSchema,
});

export type LLMResponse = z.infer<typeof LLMResponseSchema>;
