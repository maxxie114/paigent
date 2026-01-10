/**
 * Planner Agent
 *
 * @description Converts user intent into a structured workflow graph.
 * Uses GLM-4.7 Thinking model via Fireworks AI Responses API for
 * advanced reasoning capabilities and conversation continuation.
 * Includes Galileo observability for tracing planning operations.
 *
 * @see paigent-studio-spec.md Section 12.1
 * @see https://docs.fireworks.ai/api-reference/post-responses
 * @see https://fireworks.ai/models/fireworks/glm-4p7
 */

import {
  callWithSystemPrompt,
  RESPONSES_API_MODELS,
  type ProcessedResponse,
} from "@/lib/fireworks/responses";
import { extractJsonWithRepair } from "@/lib/utils/json-parser";
import { RunGraph, validateGraph } from "@/types/graph";
import { PLANNER_SYSTEM_PROMPT, createPlannerUserPrompt, createRetryPrompt } from "@/lib/fireworks/prompts/planner";
import type { ToolDocument, WorkspaceSettings } from "@/lib/db/collections";
import { createGalileoTrace, msToNs } from "@/lib/galileo/client";

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
 * errors to help it correct the output. All operations are traced via Galileo.
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

  // Start Galileo trace for the planning operation
  const trace = createGalileoTrace({
    input: intent,
    name: "Workflow Planning",
    tags: ["planner", "agent"],
    metadata: {
      toolCount: String(availableTools.length),
      autoPayEnabled: String(workspaceSettings.autoPayEnabled),
    },
  });

  // Add agent span for the planner
  trace.addAgentSpan({
    input: intent,
    name: "Planner Agent",
    agentType: "planner",
    metadata: {
      maxBudgetAtomic: maxBudgetAtomic ?? "unlimited",
    },
  });

  const planningStartTime = Date.now();

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
      // Call GLM-4.7 via Responses API for advanced reasoning
      // Skip Galileo logging in the call since we're tracing at higher level
      const response: ProcessedResponse = await callWithSystemPrompt(
        {
          systemPrompt: PLANNER_SYSTEM_PROMPT,
          userPrompt,
          model: RESPONSES_API_MODELS.GLM_4P7,
          maxOutputTokens: 4096,
          temperature: 0.7,
          // Enable reasoning for complex planning tasks
          reasoning: { effort: "medium" },
          // Store responses for potential debugging/continuation
          store: true,
        },
        {
          skipGalileoLogging: true, // We handle logging at the agent level
        }
      );

      // Log the LLM call within the planner agent span
      trace.addLLMSpan({
        input: [
          { role: "system", content: PLANNER_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        output: { role: "assistant", content: response.text },
        model: response.raw.model,
        name: `Planner LLM Call (attempt ${attempts})`,
        durationNs: msToNs(response.latencyMs),
        numInputTokens: response.usage.promptTokens,
        numOutputTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        temperature: 0.7,
        statusCode: response.success ? 200 : 500,
        tags: ["planner", "llm", "responses-api", "glm-4p7"],
        metadata: {
          attempt: String(attempts),
          responseId: response.id ?? "not_stored",
          reasoningTokens: String(response.usage.reasoningTokens),
        },
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

      // Success! Conclude the agent span and complete the trace
      const planningDurationNs = msToNs(Date.now() - planningStartTime);
      trace.conclude({
        output: JSON.stringify({
          success: true,
          nodeCount: validation.data?.nodes.length ?? 0,
          attempts,
        }),
        durationNs: planningDurationNs,
        statusCode: 200,
      });

      await trace.complete({
        output: JSON.stringify({
          success: true,
          graph: validation.data,
          attempts,
          totalLatencyMs,
          totalTokens,
        }),
      });

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

  // All attempts failed - conclude with error
  const planningDurationNs = msToNs(Date.now() - planningStartTime);
  trace.conclude({
    output: lastError,
    durationNs: planningDurationNs,
    statusCode: 500,
  });

  await trace.complete({
    error: `Failed to generate valid workflow after ${MAX_ATTEMPTS} attempts. Last error: ${lastError}`,
  });

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
