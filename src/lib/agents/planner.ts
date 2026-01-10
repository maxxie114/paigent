/**
 * Planner Agent
 *
 * @description Converts user intent into a structured workflow graph.
 * Uses GLM-4.7 Thinking model via Fireworks AI.
 *
 * @see paigent-studio-spec.md Section 12.1
 */

import { callLLM, FIREWORKS_MODELS } from "@/lib/fireworks/client";
import { extractJsonWithRepair } from "@/lib/utils/json-parser";
import { RunGraph, validateGraph } from "@/types/graph";
import { PLANNER_SYSTEM_PROMPT, createPlannerUserPrompt, createRetryPrompt } from "@/lib/fireworks/prompts/planner";
import type { ToolDocument, WorkspaceSettings } from "@/lib/db/collections";

/**
 * Planner input parameters.
 */
export type PlannerInput = {
  /** User's intent or goal. */
  intent: string;
  /** Available tools for the workflow. */
  availableTools: ToolDocument[];
  /** Workspace settings including auto-pay policy. */
  workspaceSettings: WorkspaceSettings;
  /** Maximum budget for this run. */
  maxBudgetAtomic?: string;
};

/**
 * Planner output result.
 */
export type PlannerResult = {
  /** Whether planning succeeded. */
  success: boolean;
  /** The generated workflow graph (if successful). */
  graph?: RunGraph;
  /** Error message (if failed). */
  error?: string;
  /** Raw LLM response for debugging. */
  rawResponse?: string;
  /** Number of attempts made. */
  attempts: number;
  /** Total latency in milliseconds. */
  totalLatencyMs: number;
  /** Total tokens used. */
  totalTokens: number;
};

/**
 * Maximum planning attempts before giving up.
 */
const MAX_ATTEMPTS = 3;

/**
 * Plan a workflow from user intent.
 *
 * @description Calls the LLM to generate a workflow graph, with automatic
 * retry on validation failures. The LLM is re-prompted with validation
 * errors to help it correct the output.
 *
 * @param input - The planner input.
 * @returns The planner result with graph or error.
 *
 * @example
 * ```typescript
 * const result = await planWorkflow({
 *   intent: "Summarize the top 3 news articles about AI",
 *   availableTools: tools,
 *   workspaceSettings: workspace.settings,
 * });
 *
 * if (result.success && result.graph) {
 *   // Use the graph
 *   console.log("Nodes:", result.graph.nodes.length);
 * }
 * ```
 */
export async function planWorkflow(input: PlannerInput): Promise<PlannerResult> {
  const {
    intent,
    availableTools,
    workspaceSettings,
    maxBudgetAtomic = workspaceSettings.autoPayMaxPerRunAtomic,
  } = input;

  // Prepare tool information for the prompt
  const toolsForPrompt = availableTools.map((tool) => ({
    id: tool._id.toString(),
    name: tool.name,
    description: tool.description,
    endpoints: tool.endpoints.map((ep) => ({
      path: ep.path,
      method: ep.method,
      description: ep.description,
    })),
    pricingHints: tool.pricingHints,
  }));

  // Create the initial user prompt
  let userPrompt = createPlannerUserPrompt({
    intent,
    availableTools: toolsForPrompt,
    autoPayEnabled: workspaceSettings.autoPayEnabled,
    maxBudgetAtomic,
  });

  let attempts = 0;
  let totalLatencyMs = 0;
  let totalTokens = 0;
  let lastRawResponse = "";
  let lastError = "";

  while (attempts < MAX_ATTEMPTS) {
    attempts++;

    try {
      // Call LLM
      const response = await callLLM({
        systemPrompt: PLANNER_SYSTEM_PROMPT,
        userPrompt,
        model: FIREWORKS_MODELS.GLM_4_9B,
        maxTokens: 4096,
        temperature: 0.7,
      });

      lastRawResponse = response.text;
      totalLatencyMs += response.latencyMs;
      totalTokens += response.usage.totalTokens;

      // Extract JSON from response
      const extracted = extractJsonWithRepair(response.text);

      if (extracted === undefined) {
        lastError = "No valid JSON found in response";
        userPrompt = createRetryPrompt(response.text, lastError);
        continue;
      }

      // Validate against schema
      const validation = validateGraph(extracted);

      if (!validation.valid) {
        lastError = validation.errors?.join("; ") ?? "Schema validation failed";
        userPrompt = createRetryPrompt(response.text, lastError);
        continue;
      }

      // Success!
      return {
        success: true,
        graph: validation.data,
        attempts,
        totalLatencyMs,
        totalTokens,
        rawResponse: lastRawResponse,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown error";

      // On API errors, don't retry with new prompt - just re-attempt
      if (attempts < MAX_ATTEMPTS) {
        // Small delay before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  // All attempts failed
  return {
    success: false,
    error: `Failed to generate valid workflow after ${MAX_ATTEMPTS} attempts. Last error: ${lastError}`,
    rawResponse: lastRawResponse,
    attempts,
    totalLatencyMs,
    totalTokens,
  };
}

/**
 * Create a minimal fallback graph for error cases.
 *
 * @description Creates a simple graph with just a finalize node
 * that explains the planning failure. Used when planning completely fails.
 *
 * @param intent - The original user intent.
 * @param error - The error message.
 * @returns A minimal graph.
 */
export function createFallbackGraph(intent: string, error: string): RunGraph {
  return {
    nodes: [
      {
        id: "error",
        type: "finalize",
        label: "Planning failed",
        outputFormat: "text",
        outputTemplate: `Failed to create a workflow plan for: "${intent}"\n\nError: ${error}\n\nPlease try rephrasing your request or contact support if the issue persists.`,
      },
    ],
    edges: [],
    entryNodeId: "error",
  };
}

/**
 * Estimate the cost of a workflow graph.
 *
 * @description Calculates the estimated cost based on tool pricing hints.
 * This is a rough estimate and actual costs may vary.
 *
 * @param graph - The workflow graph.
 * @param toolPricing - Map of tool ID to pricing hints.
 * @returns Estimated cost in atomic USDC.
 */
export function estimateGraphCost(
  graph: RunGraph,
  toolPricing: Map<string, { typicalAmountAtomic?: string }>
): string {
  let totalAtomic = BigInt(0);

  for (const node of graph.nodes) {
    if (node.type === "tool_call" && node.toolId) {
      const pricing = toolPricing.get(node.toolId);
      if (pricing?.typicalAmountAtomic) {
        totalAtomic += BigInt(pricing.typicalAmountAtomic);
      }
    }
  }

  return totalAtomic.toString();
}

/**
 * Get a summary of the workflow graph.
 *
 * @description Creates a human-readable summary of the graph
 * for display in the UI.
 *
 * @param graph - The workflow graph.
 * @returns Summary object.
 */
export function getGraphSummary(graph: RunGraph): {
  totalNodes: number;
  nodesByType: Record<string, number>;
  hasApprovalGates: boolean;
  hasBranching: boolean;
  estimatedSteps: number;
} {
  const nodesByType: Record<string, number> = {};

  for (const node of graph.nodes) {
    nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
  }

  return {
    totalNodes: graph.nodes.length,
    nodesByType,
    hasApprovalGates: (nodesByType["approval"] || 0) > 0,
    hasBranching: (nodesByType["branch"] || 0) > 0,
    estimatedSteps: graph.nodes.length,
  };
}
