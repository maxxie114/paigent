/**
 * Workflow Graph Zod Schemas
 *
 * @description Zod validation schemas for the run workflow graph structure.
 * Used for validating LLM-generated workflow plans.
 *
 * @see paigent-studio-spec.md Section 7.3 for graph schema
 */

import { z } from "zod";
import { AtomicAmountSchema } from "./database";

// =============================================================================
// Node Types
// =============================================================================

/**
 * Node type enum schema.
 */
export const NodeTypeSchema = z.enum([
  "tool_call",
  "llm_reason",
  "approval",
  "branch",
  "wait",
  "merge",
  "finalize",
]);

export type NodeType = z.infer<typeof NodeTypeSchema>;

/**
 * Node policy configuration schema.
 */
export const NodePolicySchema = z.object({
  /** Whether this node requires user approval. */
  requiresApproval: z.boolean().optional(),
  /** Maximum retry attempts (default: 3). */
  maxRetries: z.number().int().min(0).max(10).default(3),
  /** Timeout in milliseconds (default: 30000). */
  timeoutMs: z.number().int().min(1000).max(300000).default(30000),
});

export type NodePolicy = z.infer<typeof NodePolicySchema>;

/**
 * Tool call endpoint configuration.
 */
export const ToolCallEndpointSchema = z.object({
  path: z.string().min(1),
  method: z.string().transform((m) => m.toUpperCase()),
});

export type ToolCallEndpoint = z.infer<typeof ToolCallEndpointSchema>;

/**
 * Tool call payment configuration.
 */
export const ToolCallPaymentSchema = z.object({
  /** Whether payment is allowed for this tool call. */
  allowed: z.boolean(),
  /** Maximum payment amount in atomic units. */
  maxAtomic: AtomicAmountSchema.optional(),
});

export type ToolCallPayment = z.infer<typeof ToolCallPaymentSchema>;

/**
 * Async tool handling configuration.
 */
export const AsyncConfigSchema = z.object({
  mode: z.enum(["sync", "poll"]),
  pollUrlPath: z.string().optional(),
  maxPolls: z.number().int().min(1).max(100).default(10),
  pollIntervalMs: z.number().int().min(1000).max(60000).default(5000),
});

export type AsyncConfig = z.infer<typeof AsyncConfigSchema>;

// =============================================================================
// Base Node Schema
// =============================================================================

/**
 * Base node properties shared by all node types.
 */
const BaseNodeSchema = z.object({
  /** Unique node ID within the graph. */
  id: z.string().min(1).max(100),
  /** Node type. */
  type: NodeTypeSchema,
  /** Human-readable label for display. */
  label: z.string().min(1).max(200),
  /** Explicit dependencies (node IDs that must complete first). */
  dependsOn: z.array(z.string()).optional(),
  /** Node execution policy. */
  policy: NodePolicySchema.optional(),
});

// =============================================================================
// Specialized Node Schemas
// =============================================================================

/**
 * Tool call node schema.
 * Represents an HTTP call to an external tool (may require x402 payment).
 */
export const ToolCallNodeSchema = BaseNodeSchema.extend({
  type: z.literal("tool_call"),
  /** Reference to the tool ID. */
  toolId: z.string().optional(),
  /** Endpoint configuration. */
  endpoint: ToolCallEndpointSchema.optional(),
  /** Request body template with variable placeholders. */
  requestTemplate: z.record(z.unknown()).optional(),
  /** Expected response schema for validation. */
  responseSchema: z.record(z.unknown()).optional(),
  /** Payment configuration. */
  payment: ToolCallPaymentSchema.optional(),
  /** SSRF policy allowlist reference. */
  ssrfPolicy: z.string().optional(),
  /** Async handling configuration. */
  async: AsyncConfigSchema.optional(),
});

export type ToolCallNode = z.infer<typeof ToolCallNodeSchema>;

/**
 * LLM reasoning node schema.
 * Represents an LLM call for planning, summarization, or critique.
 */
export const LLMReasonNodeSchema = BaseNodeSchema.extend({
  type: z.literal("llm_reason"),
  /** System prompt for the LLM. */
  systemPrompt: z.string().optional(),
  /** User prompt template. */
  userPromptTemplate: z.string().optional(),
  /** Expected output format. */
  outputFormat: z.enum(["text", "json"]).default("text"),
  /** JSON schema for output validation (if outputFormat is "json"). */
  outputSchema: z.record(z.unknown()).optional(),
});

export type LLMReasonNode = z.infer<typeof LLMReasonNodeSchema>;

/**
 * Approval node schema.
 * Pauses execution until user approves or rejects.
 */
export const ApprovalNodeSchema = BaseNodeSchema.extend({
  type: z.literal("approval"),
  /** Message to display to the user. */
  message: z.string().optional(),
  /** Context data to show in the approval dialog. */
  contextKeys: z.array(z.string()).optional(),
});

export type ApprovalNode = z.infer<typeof ApprovalNodeSchema>;

/**
 * Branch node schema.
 * Conditional branching based on expression evaluation.
 */
export const BranchNodeSchema = BaseNodeSchema.extend({
  type: z.literal("branch"),
  /** Condition expression (safe expression language). */
  condition: z.string(),
  /** Node ID to execute if condition is true. */
  trueBranch: z.string().optional(),
  /** Node ID to execute if condition is false. */
  falseBranch: z.string().optional(),
});

export type BranchNode = z.infer<typeof BranchNodeSchema>;

/**
 * Wait/poll node schema.
 * Waits for an async operation to complete.
 */
export const WaitNodeSchema = BaseNodeSchema.extend({
  type: z.literal("wait"),
  /** Status URL to poll. */
  statusUrl: z.string().optional(),
  /** Maximum wait time in milliseconds. */
  maxWaitMs: z.number().int().min(1000).default(300000),
  /** Poll interval in milliseconds. */
  pollIntervalMs: z.number().int().min(1000).default(5000),
  /** Expected completion field in response. */
  completionField: z.string().default("status"),
  /** Expected completion value. */
  completionValue: z.string().default("completed"),
});

export type WaitNode = z.infer<typeof WaitNodeSchema>;

/**
 * Merge node schema.
 * Joins multiple branches back together.
 */
export const MergeNodeSchema = BaseNodeSchema.extend({
  type: z.literal("merge"),
  /** Strategy for merging outputs from multiple branches. */
  mergeStrategy: z.enum(["all", "any", "first"]).default("all"),
});

export type MergeNode = z.infer<typeof MergeNodeSchema>;

/**
 * Finalize node schema.
 * Produces the final deliverable of the workflow.
 */
export const FinalizeNodeSchema = BaseNodeSchema.extend({
  type: z.literal("finalize"),
  /** Output format for the final deliverable. */
  outputFormat: z.enum(["text", "json", "markdown", "html"]).default("text"),
  /** Template for final output. */
  outputTemplate: z.string().optional(),
});

export type FinalizeNode = z.infer<typeof FinalizeNodeSchema>;

// =============================================================================
// Unified Node Schema
// =============================================================================

/**
 * Unified node schema using discriminated union.
 */
export const NodeSchema = z.discriminatedUnion("type", [
  ToolCallNodeSchema,
  LLMReasonNodeSchema,
  ApprovalNodeSchema,
  BranchNodeSchema,
  WaitNodeSchema,
  MergeNodeSchema,
  FinalizeNodeSchema,
]);

export type Node = z.infer<typeof NodeSchema>;

/**
 * Simplified node schema for LLM output parsing.
 * More lenient than the full schema to handle LLM variations.
 */
export const SimplifiedNodeSchema = z.object({
  id: z.string().min(1),
  type: NodeTypeSchema,
  label: z.string().min(1),
  dependsOn: z.array(z.string()).optional(),
  policy: NodePolicySchema.optional(),
  // Allow additional properties for type-specific fields
  toolId: z.string().optional(),
  endpoint: ToolCallEndpointSchema.optional(),
  requestTemplate: z.record(z.unknown()).optional(),
  payment: ToolCallPaymentSchema.optional(),
  systemPrompt: z.string().optional(),
  userPromptTemplate: z.string().optional(),
  outputFormat: z.string().optional(),
  message: z.string().optional(),
  condition: z.string().optional(),
  statusUrl: z.string().optional(),
  mergeStrategy: z.string().optional(),
  outputTemplate: z.string().optional(),
});

export type SimplifiedNode = z.infer<typeof SimplifiedNodeSchema>;

// =============================================================================
// Edge Types
// =============================================================================

/**
 * Edge type enum schema.
 */
export const EdgeTypeSchema = z.enum(["success", "failure", "conditional"]);

export type EdgeType = z.infer<typeof EdgeTypeSchema>;

/**
 * Graph edge schema.
 */
export const EdgeSchema = z.object({
  /** Source node ID. */
  from: z.string().min(1),
  /** Target node ID. */
  to: z.string().min(1),
  /** Edge type determining when this edge is followed. */
  type: EdgeTypeSchema,
  /** Condition expression for conditional edges. */
  condition: z.string().optional(),
});

export type Edge = z.infer<typeof EdgeSchema>;

// =============================================================================
// Run Graph Schema
// =============================================================================

/**
 * Complete run graph schema.
 */
export const RunGraphSchema = z
  .object({
    /** Array of nodes in the graph. */
    nodes: z.array(SimplifiedNodeSchema).min(1),
    /** Array of edges connecting nodes. */
    edges: z.array(EdgeSchema),
    /** ID of the entry node (first node to execute). */
    entryNodeId: z.string().min(1),
  })
  .refine(
    (graph) => {
      // Validate that entryNodeId exists in nodes
      return graph.nodes.some((node) => node.id === graph.entryNodeId);
    },
    {
      message: "entryNodeId must reference an existing node",
    }
  )
  .refine(
    (graph) => {
      // Validate that all edge references exist
      const nodeIds = new Set(graph.nodes.map((n) => n.id));
      return graph.edges.every(
        (edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to)
      );
    },
    {
      message: "All edge 'from' and 'to' must reference existing nodes",
    }
  )
  .refine(
    (graph) => {
      // Validate no self-loops
      return graph.edges.every((edge) => edge.from !== edge.to);
    },
    {
      message: "Self-loops are not allowed",
    }
  )
  .refine(
    (graph) => {
      // Validate that all tool_call nodes have a toolId
      // This is REQUIRED for the executor to know which tool to call
      return graph.nodes.every((node) => {
        if (node.type === "tool_call") {
          return (
            typeof node.toolId === "string" && node.toolId.trim().length > 0
          );
        }
        return true;
      });
    },
    {
      message:
        "All tool_call nodes MUST have a non-empty 'toolId' field. " +
        "The toolId should be the MongoDB ObjectId of the tool from the available tools list.",
    }
  );

export type RunGraph = z.infer<typeof RunGraphSchema>;

// =============================================================================
// Graph Validation Utilities
// =============================================================================

/**
 * Check if the graph is acyclic using DFS.
 *
 * @param graph - The graph to check.
 * @returns True if acyclic, false if contains cycles.
 */
export function isGraphAcyclic(graph: RunGraph): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  // Build adjacency list
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.push(edge.to);
  }

  function hasCycle(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    for (const neighbor of adjacency.get(nodeId) || []) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      if (hasCycle(node.id)) return false;
    }
  }

  return true;
}

/**
 * Get topological sort of nodes (execution order).
 *
 * @param graph - The graph to sort.
 * @returns Array of node IDs in topological order, or null if cyclic.
 */
export function getTopologicalOrder(graph: RunGraph): string[] | null {
  if (!isGraphAcyclic(graph)) return null;

  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const node of graph.nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  // Build graph
  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }

  // Kahn's algorithm
  const queue: string[] = [];
  const result: string[] = [];

  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) queue.push(nodeId);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    for (const neighbor of adjacency.get(current) || []) {
      const newDegree = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  return result.length === graph.nodes.length ? result : null;
}

/**
 * Validate a complete graph with all checks.
 *
 * @param graph - The graph to validate.
 * @returns Validation result with errors if any.
 */
export function validateGraph(graph: unknown): {
  valid: boolean;
  data?: RunGraph;
  errors?: string[];
} {
  // Parse with Zod
  const parseResult = RunGraphSchema.safeParse(graph);

  if (!parseResult.success) {
    return {
      valid: false,
      errors: parseResult.error.errors.map(
        (e) => `${e.path.join(".")}: ${e.message}`
      ),
    };
  }

  const validGraph = parseResult.data;

  // Check for cycles
  if (!isGraphAcyclic(validGraph)) {
    return {
      valid: false,
      errors: ["Graph contains cycles"],
    };
  }

  // Check that entry node has no incoming edges
  const hasIncomingToEntry = validGraph.edges.some(
    (e) => e.to === validGraph.entryNodeId
  );
  if (hasIncomingToEntry) {
    return {
      valid: false,
      errors: ["Entry node should not have incoming edges"],
    };
  }

  return {
    valid: true,
    data: validGraph,
  };
}
