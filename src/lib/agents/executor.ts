/**
 * Step Executor Agent
 *
 * @description Executes individual workflow steps based on their node type.
 * Handles tool calls, LLM reasoning, approvals, and other node types.
 * Uses GLM-4.7 via Fireworks Responses API for LLM reasoning steps.
 * Includes Galileo observability for tracing step executions.
 *
 * Tool calls use the x402 protocol for pay-per-request micropayments:
 * - Makes real HTTP requests to tool endpoints
 * - Handles 402 Payment Required responses automatically
 * - Signs payments using CDP Server Wallet
 * - Records payment receipts and updates budgets
 *
 * @see paigent-studio-spec.md Section 14
 * @see https://docs.fireworks.ai/api-reference/post-responses
 * @see https://docs.cdp.coinbase.com/x402/welcome
 */

import { Db, ObjectId } from "mongodb";
import {
  RunStepDocument,
  RunDocument,
  RunGraphNode,
  StepError,
} from "@/lib/db/collections";
import {
  markStepSucceeded,
  markStepFailed,
  scheduleStepRetry,
  markStepBlocked,
  unblockDependentSteps,
  checkRunCompletion,
} from "@/lib/db/queries/steps";
import { getRun, updateRunStatus, updateRunHeartbeat } from "@/lib/db/queries/runs";
import { appendRunEvent } from "@/lib/db/queries/events";
import { getToolById, updateToolReputation, updateToolPricing } from "@/lib/db/queries/tools";
import { getWorkspace } from "@/lib/db/queries/workspaces";
import { checkBudgetAndDeduct } from "@/lib/db/queries/budgets";
import { x402Fetch } from "@/lib/cdp/x402-fetch";
import {
  callWithSystemPrompt,
  RESPONSES_API_MODELS,
} from "@/lib/fireworks/responses";
import { extractJsonWithRepair } from "@/lib/utils/json-parser";
import { createGalileoTrace } from "@/lib/galileo/client";

/**
 * Step execution result.
 */
export type StepExecutionResult = {
  /** Execution status. */
  status: "succeeded" | "failed" | "retrying" | "blocked";
  /** Result data (if succeeded). */
  result?: unknown;
  /** Error information (if failed or retrying). */
  error?: StepError;
  /** Execution metrics. */
  metrics?: {
    latencyMs: number;
    tokensUsed?: number;
    costAtomic?: string;
  };
};

/**
 * Calculate exponential backoff delay.
 *
 * @param attempt - Current attempt number (1-based).
 * @param baseMs - Base delay in milliseconds.
 * @param maxMs - Maximum delay in milliseconds.
 * @returns Delay in milliseconds.
 */
function calculateBackoff(attempt: number, baseMs = 1000, maxMs = 60000): number {
  const delay = Math.min(baseMs * Math.pow(2, attempt - 1), maxMs);
  // Add jitter (10%)
  return delay + Math.random() * delay * 0.1;
}

/**
 * Normalize an error to StepError format.
 */
function normalizeError(error: unknown): StepError {
  if (error instanceof Error) {
    return {
      code: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: String(error),
  };
}

/**
 * Execute a tool_call step.
 *
 * @description Makes a real HTTP request to the tool endpoint with full x402
 * payment handling. The flow is:
 *
 * 1. Resolve tool and endpoint from database
 * 2. Build request URL and body from step inputs
 * 3. Make HTTP request via x402Fetch wrapper
 * 4. If 402 received, handle payment automatically (within budget limits)
 * 5. Record payment receipts and update tool reputation
 * 6. Return response data or error
 *
 * @param db - MongoDB database instance.
 * @param step - The step document to execute.
 * @param run - The parent run document.
 * @param workerId - The worker ID for logging.
 * @returns Step execution result with response data and metrics.
 *
 * @see https://docs.cdp.coinbase.com/x402/quickstart-for-buyers
 */
async function executeToolCall(
  db: Db,
  step: RunStepDocument,
  run: RunDocument,
  workerId: string
): Promise<StepExecutionResult> {
  const startTime = Date.now();

  try {
    // Get the node definition from the graph
    const node = run.graph.nodes.find((n) => n.id === step.stepId);
    if (!node || node.type !== "tool_call") {
      throw new Error(`Node ${step.stepId} not found or invalid type`);
    }

    // Cast to get tool_call specific properties
    const toolNode = node as RunGraphNode & {
      toolId?: string;
      endpoint?: { path: string; method: string };
      requestTemplate?: Record<string, unknown>;
      payment?: { allowed: boolean; maxAtomic?: string };
    };

    // Resolve tool from database
    if (!toolNode.toolId) {
      throw new Error(`Tool ID not specified for step ${step.stepId}`);
    }

    const tool = await getToolById(new ObjectId(toolNode.toolId));
    if (!tool) {
      throw new Error(`Tool ${toolNode.toolId} not found in database`);
    }

    // Determine endpoint
    const endpointConfig = toolNode.endpoint || tool.endpoints[0];
    if (!endpointConfig) {
      throw new Error(`No endpoint configured for tool ${tool.name}`);
    }

    // Build the full URL
    const fullUrl = new URL(endpointConfig.path, tool.baseUrl).toString();

    // Build request body from inputs and template
    const inputs = step.inputs || {};
    let requestBody: Record<string, unknown> | undefined;

    if (toolNode.requestTemplate) {
      // Substitute variables in template with input values
      requestBody = JSON.parse(
        JSON.stringify(toolNode.requestTemplate).replace(
          /\{\{(\w+)\}\}/g,
          (_, key) => {
            const value = inputs[key];
            return typeof value === "string" ? value : JSON.stringify(value ?? "");
          }
        )
      );
    } else if (Object.keys(inputs).length > 0) {
      // Use inputs directly as request body
      requestBody = inputs;
    }

    // Determine method
    const method = endpointConfig.method?.toUpperCase() || "GET";

    // Build fetch options
    const fetchInit: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Paigent-Studio/1.0",
      },
    };

    // Add body for non-GET requests
    if (method !== "GET" && method !== "HEAD" && requestBody) {
      fetchInit.body = JSON.stringify(requestBody);
    }

    // Determine payment limits
    // Priority: node config > workspace per-step limit > default
    const workspace = await getWorkspace(run.workspaceId);
    const workspaceSettings = workspace?.settings;

    const paymentAllowed = toolNode.payment?.allowed ?? workspaceSettings?.autoPayEnabled ?? false;
    const maxPaymentAtomic =
      toolNode.payment?.maxAtomic ||
      workspaceSettings?.autoPayMaxPerStepAtomic ||
      "1000000"; // Default 1 USDC

    // Build allowlist from workspace settings
    const allowlist = workspaceSettings?.toolAllowlist || [];

    console.log(
      `[Tool Call] Executing ${method} ${fullUrl} (tool: ${tool.name}, payment: ${paymentAllowed ? "allowed up to " + maxPaymentAtomic : "disabled"})`
    );

    // Log tool call initiation
    await appendRunEvent({
      workspaceId: step.workspaceId,
      runId: step.runId,
      type: "STEP_STARTED",
      data: {
        stepId: step.stepId,
        toolId: tool._id.toString(),
        toolName: tool.name,
        url: fullUrl,
        method,
        paymentAllowed,
        maxPaymentAtomic,
      },
      actor: { type: "system", id: workerId },
    });

    // Make the HTTP request with x402 payment handling
    let result: { response: unknown; paid: boolean; receipt?: { id: string; amountAtomic: string; txHash?: string } };

    if (paymentAllowed) {
      // Use x402Fetch which handles 402 responses automatically
      result = await x402Fetch(fullUrl, fetchInit, {
        maxPaymentAtomic,
        runId: step.runId,
        stepId: step.stepId,
        workspaceId: step.workspaceId,
        toolId: tool._id,
        allowlist,
      });
    } else {
      // No payment allowed - make plain fetch request
      const response = await fetch(fullUrl, {
        ...fetchInit,
        redirect: "error", // SSRF protection
      });

      // Check for 402 - if payment not allowed, this is an error
      if (response.status === 402) {
        throw new Error(
          `Tool ${tool.name} requires payment (HTTP 402), but payment is not allowed for this step. ` +
            `Enable auto-pay in workspace settings or configure payment.allowed for this node.`
        );
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tool request failed: ${response.status} - ${errorText}`);
      }

      result = {
        response: await response.json(),
        paid: false,
      };
    }

    const latencyMs = Date.now() - startTime;

    // Update tool reputation with success
    await updateToolReputation(tool._id, true, latencyMs);

    // If payment was made, update the tool's pricing hints and run budget
    if (result.paid && result.receipt) {
      // Update tool pricing hints based on actual payment
      await updateToolPricing(tool._id, {
        typicalAmountAtomic: result.receipt.amountAtomic,
        network: run.budget?.network || "eip155:84532",
        asset: "USDC",
      });

      // Update run budget spent (atomic increment)
      await checkBudgetAndDeduct({
        runId: step.runId,
        amountAtomic: result.receipt.amountAtomic,
      });

      console.log(
        `[Tool Call] Paid ${result.receipt.amountAtomic} atomic USDC for ${tool.name} (receipt: ${result.receipt.id})`
      );
    }

    console.log(
      `[Tool Call] ${tool.name} completed in ${latencyMs}ms (paid: ${result.paid})`
    );

    return {
      status: "succeeded",
      result: {
        data: result.response,
        toolName: tool.name,
        url: fullUrl,
        method,
        paid: result.paid,
        receipt: result.receipt,
        timestamp: new Date().toISOString(),
      },
      metrics: {
        latencyMs,
        costAtomic: result.receipt?.amountAtomic,
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    console.error(`[Tool Call] Step ${step.stepId} failed:`, error);

    // Try to update tool reputation with failure
    const node = run.graph.nodes.find((n) => n.id === step.stepId);
    if (node && (node as RunGraphNode & { toolId?: string }).toolId) {
      try {
        await updateToolReputation(
          new ObjectId((node as RunGraphNode & { toolId?: string }).toolId!),
          false,
          latencyMs
        );
      } catch {
        // Ignore reputation update errors
      }
    }

    return {
      status: "failed",
      error: normalizeError(error),
      metrics: {
        latencyMs,
      },
    };
  }
}

/**
 * Build a context-aware prompt from step inputs.
 *
 * @description Formats the inputs from upstream steps into a readable context
 * section for the LLM prompt.
 *
 * @param inputs - The inputs from upstream steps.
 * @returns Formatted context string.
 */
function buildInputContext(inputs: Record<string, unknown>): string {
  if (!inputs || Object.keys(inputs).length === 0) {
    return "";
  }

  const sections: string[] = [];

  for (const [key, value] of Object.entries(inputs)) {
    const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    
    if (typeof value === "string") {
      sections.push(`## ${label}\n${value}`);
    } else if (typeof value === "object" && value !== null) {
      // Handle nested objects
      const obj = value as Record<string, unknown>;
      if (obj.output && typeof obj.output === "string") {
        sections.push(`## ${label}\n${obj.output}`);
      } else if (obj.result && typeof obj.result === "string") {
        sections.push(`## ${label}\n${obj.result}`);
      } else if (obj.text && typeof obj.text === "string") {
        sections.push(`## ${label}\n${obj.text}`);
      } else {
        sections.push(`## ${label}\n${JSON.stringify(value, null, 2)}`);
      }
    } else {
      sections.push(`## ${label}\n${String(value)}`);
    }
  }

  return sections.join("\n\n");
}

/**
 * Execute an llm_reason step.
 *
 * @description Calls the LLM for analysis, summarization, or decision-making.
 * Builds a context-aware prompt from upstream step outputs and the workflow goal.
 * Includes Galileo logging for the LLM call.
 */
 
async function executeLLMReason(
  _db: Db,
  step: RunStepDocument,
  run: RunDocument,
  _workerId: string
): Promise<StepExecutionResult> {
   
  const startTime = Date.now();

  try {
    // Get the node definition from the graph
    const node = run.graph.nodes.find((n) => n.id === step.stepId);
    if (!node || node.type !== "llm_reason") {
      throw new Error("Node not found or invalid type");
    }

    const nodeLabel = (node as { label?: string }).label || step.stepId;
    const workflowGoal = run.input?.text || "Complete the workflow task";

    // Build system prompt with workflow context
    const customSystemPrompt = (node as { systemPrompt?: string }).systemPrompt;
    const systemPrompt = customSystemPrompt || 
      `You are an AI assistant executing a step in an automated workflow.

Your current task is: "${nodeLabel}"
The overall workflow goal is: "${workflowGoal}"

Instructions:
- Focus on completing the specific task assigned to this step
- Use the provided context from previous steps
- Provide clear, actionable output that can be used by subsequent steps
- Be concise but thorough`;

    // Get inputs from previous steps
    const inputs = step.inputs || {};
    const hasInputs = Object.keys(inputs).length > 0;
    
    // Build user prompt with context from upstream steps
    const customUserPrompt = (node as { userPromptTemplate?: string }).userPromptTemplate;
    let userPrompt: string;
    
    if (customUserPrompt) {
      // Use custom prompt template
      userPrompt = customUserPrompt;
      if (hasInputs) {
        userPrompt += "\n\n# Context from Previous Steps\n\n" + buildInputContext(inputs);
      }
    } else {
      // Generate a task-specific prompt based on the node label
      userPrompt = `# Task: ${nodeLabel}

Please complete the following task as part of the workflow: "${workflowGoal}"`;

      if (hasInputs) {
        userPrompt += "\n\n# Input Data from Previous Steps\n\n" + buildInputContext(inputs);
        userPrompt += "\n\n# Instructions\n\nUsing the input data above, complete the task: " + nodeLabel;
      } else {
        // This is likely the first step - infer what to do from the workflow goal
        userPrompt += `

Since this is the first step in the workflow, use your knowledge to complete the task.
Provide detailed, useful output that subsequent steps can build upon.`;
      }
    }

    console.log(`[LLM Reason] Executing step "${nodeLabel}" with ${Object.keys(inputs).length} inputs`);

    // Call GLM-4.7 via Responses API for reasoning step
    // Galileo logging is enabled for observability
    const response = await callWithSystemPrompt(
      {
        systemPrompt,
        userPrompt,
        model: RESPONSES_API_MODELS.GLM_4P7,
        maxOutputTokens: 2048,
        temperature: 0.7,
        // Enable reasoning for LLM reasoning steps
        reasoning: { effort: "medium" },
        // Store responses for debugging/audit trail
        store: true,
      },
      {
        spanName: `LLM Reason: ${step.stepId}`,
        tags: ["llm_reason", "executor", "reasoning", "glm-4p7"],
        metadata: {
          stepId: step.stepId,
          runId: step.runId.toString(),
          nodeLabel,
          inputCount: String(Object.keys(inputs).length),
        },
      }
    );

    // Parse output if JSON format expected
    const outputFormat = (node as { outputFormat?: string }).outputFormat || "text";
    let result: unknown = response.text;

    if (outputFormat === "json") {
      const parsed = extractJsonWithRepair(response.text);
      if (parsed !== undefined) {
        result = parsed;
      }
    }

    console.log(`[LLM Reason] Step "${nodeLabel}" completed with ${response.usage.totalTokens} tokens`);

    return {
      status: "succeeded",
      result,
      metrics: {
        latencyMs: Date.now() - startTime,
        tokensUsed: response.usage.totalTokens,
      },
    };
  } catch (error) {
    console.error(`[LLM Reason] Step "${step.stepId}" failed:`, error);
    return {
      status: "failed",
      error: normalizeError(error),
      metrics: {
        latencyMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Execute an approval step.
 *
 * @description Blocks execution until user approval.
 */
 
async function executeApproval(
  _db: Db,
  _step: RunStepDocument,
  _run: RunDocument,
  _workerId: string
): Promise<StepExecutionResult> {
   
  // Mark as blocked and wait for user action
  return {
    status: "blocked",
    error: {
      code: "AWAITING_APPROVAL",
      message: "This step requires user approval to proceed",
    },
  };
}

/**
 * Execute a wait/poll step.
 *
 * @description Polls a status endpoint until completion.
 */
 
async function executeWait(
  _db: Db,
  _step: RunStepDocument,
  _run: RunDocument,
  _workerId: string
): Promise<StepExecutionResult> {
   
  // For MVP, simulate wait completion
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return {
    status: "succeeded",
    result: { waitCompleted: true },
    metrics: {
      latencyMs: 1000,
    },
  };
}

/**
 * Execute a merge step.
 *
 * @description Collects outputs from multiple branches.
 */
 
async function executeMerge(
  _db: Db,
  step: RunStepDocument,
  _run: RunDocument,
  _workerId: string
): Promise<StepExecutionResult> {
   
  // Collect inputs from all upstream steps
  const inputs = step.inputs || {};

  return {
    status: "succeeded",
    result: {
      merged: true,
      inputCount: Object.keys(inputs).length,
      inputs,
    },
    metrics: {
      latencyMs: 0,
    },
  };
}

/**
 * Execute a finalize step.
 *
 * @description Produces the final output of the workflow.
 */
 
async function executeFinalize(
  _db: Db,
  step: RunStepDocument,
  run: RunDocument,
  _workerId: string
): Promise<StepExecutionResult> {
   
  const node = run.graph.nodes.find((n) => n.id === step.stepId);
  const outputTemplate = (node as { outputTemplate?: string })?.outputTemplate;
  const inputs = step.inputs || {};

  let finalOutput: string;

  if (outputTemplate) {
    // Simple template substitution
    finalOutput = outputTemplate;
    for (const [key, value] of Object.entries(inputs)) {
      finalOutput = finalOutput.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, "g"),
        String(value)
      );
    }
  } else {
    // Default output
    finalOutput = JSON.stringify(inputs, null, 2);
  }

  return {
    status: "succeeded",
    result: {
      output: finalOutput,
      completedAt: new Date().toISOString(),
    },
    metrics: {
      latencyMs: 0,
    },
  };
}

/**
 * Execute a step.
 *
 * @description Main entry point for step execution.
 * Routes to the appropriate handler based on node type.
 * All step executions are traced via Galileo for observability.
 */
export async function executeStep(
  db: Db,
  step: RunStepDocument,
  workerId: string
): Promise<StepExecutionResult> {
  // Start Galileo trace for step execution
  const trace = createGalileoTrace({
    input: JSON.stringify({
      stepId: step.stepId,
      nodeType: step.nodeType,
      attempt: step.attempt,
    }),
    name: `Step Execution: ${step.stepId}`,
    tags: ["executor", "step", step.nodeType],
    metadata: {
      runId: step.runId.toString(),
      workspaceId: step.workspaceId.toString(),
      workerId,
      nodeType: step.nodeType,
      attempt: String(step.attempt),
    },
  });

  const stepStartTime = Date.now();

  try {
    // Get the run
    const run = await getRun(step.runId);
    if (!run) {
      throw new Error("Run not found");
    }

    // Update heartbeat
    await updateRunHeartbeat(step.runId);

    // Append step started event
    await appendRunEvent({
      workspaceId: step.workspaceId,
      runId: step.runId,
      type: "STEP_STARTED",
      data: { stepId: step.stepId, attempt: step.attempt },
      actor: { type: "system", id: workerId },
    });

    // Route to appropriate handler
    let result: StepExecutionResult;

    switch (step.nodeType) {
      case "tool_call":
        trace.addToolSpan({
          input: JSON.stringify(step.inputs ?? {}),
          name: `Tool Call: ${step.stepId}`,
          metadata: { stepId: step.stepId },
          tags: ["tool", "executor"],
        });
        result = await executeToolCall(db, step, run, workerId);
        break;
      case "llm_reason":
        result = await executeLLMReason(db, step, run, workerId);
        // LLM span is logged within executeLLMReason
        break;
      case "approval":
        trace.addWorkflowSpan({
          input: JSON.stringify(step.inputs ?? {}),
          name: `Approval Gate: ${step.stepId}`,
          metadata: { stepId: step.stepId },
          tags: ["approval", "executor"],
        });
        result = await executeApproval(db, step, run, workerId);
        trace.conclude({ output: "Awaiting approval", statusCode: 202 });
        break;
      case "wait":
        trace.addWorkflowSpan({
          input: JSON.stringify(step.inputs ?? {}),
          name: `Wait/Poll: ${step.stepId}`,
          metadata: { stepId: step.stepId },
          tags: ["wait", "executor"],
        });
        result = await executeWait(db, step, run, workerId);
        trace.conclude({ output: "Wait completed", statusCode: 200 });
        break;
      case "merge":
        trace.addWorkflowSpan({
          input: JSON.stringify(step.inputs ?? {}),
          name: `Merge: ${step.stepId}`,
          metadata: { stepId: step.stepId },
          tags: ["merge", "executor"],
        });
        result = await executeMerge(db, step, run, workerId);
        trace.conclude({ output: JSON.stringify(result.result ?? {}), statusCode: 200 });
        break;
      case "finalize":
        trace.addWorkflowSpan({
          input: JSON.stringify(step.inputs ?? {}),
          name: `Finalize: ${step.stepId}`,
          metadata: { stepId: step.stepId },
          tags: ["finalize", "executor"],
        });
        result = await executeFinalize(db, step, run, workerId);
        trace.conclude({ output: JSON.stringify(result.result ?? {}), statusCode: 200 });
        break;
      default:
        throw new Error(`Unknown node type: ${step.nodeType}`);
    }

    // Handle result based on status
    if (result.status === "succeeded") {
      await markStepSucceeded(step._id, result.result as Record<string, unknown>, result.metrics);

      await appendRunEvent({
        workspaceId: step.workspaceId,
        runId: step.runId,
        type: "STEP_SUCCEEDED",
        data: { stepId: step.stepId, latencyMs: result.metrics?.latencyMs },
        actor: { type: "system", id: workerId },
      });

      // Unblock dependent steps
      await unblockDependentSteps(step.runId, step.stepId, run.graph);

      // Check if run is complete
      const completion = await checkRunCompletion(step.runId);
      if (completion.complete) {
        const finalStatus = completion.failed > 0 ? "failed" : "succeeded";
        await updateRunStatus(step.runId, finalStatus);

        await appendRunEvent({
          workspaceId: step.workspaceId,
          runId: step.runId,
          type: finalStatus === "succeeded" ? "RUN_SUCCEEDED" : "RUN_FAILED",
          data: {
            succeeded: completion.succeeded,
            failed: completion.failed,
          },
          actor: { type: "system", id: workerId },
        });
      }

      // Complete trace with success
      const stepDurationMs = Date.now() - stepStartTime;
      await trace.complete({
        output: JSON.stringify({
          status: "succeeded",
          result: result.result,
          latencyMs: stepDurationMs,
        }),
      });
    } else if (result.status === "blocked") {
      await markStepBlocked(step._id, result.error?.message || "Blocked");

      await appendRunEvent({
        workspaceId: step.workspaceId,
        runId: step.runId,
        type: "STEP_BLOCKED",
        data: { stepId: step.stepId, reason: result.error?.message },
        actor: { type: "system", id: workerId },
      });

      // Update run status if this is an approval gate
      if (step.nodeType === "approval") {
        await updateRunStatus(step.runId, "paused_for_approval");
      }

      // Complete trace with blocked status
      await trace.complete({
        output: JSON.stringify({
          status: "blocked",
          reason: result.error?.message,
        }),
      });
    } else if (result.status === "failed" || result.status === "retrying") {
      // Complete trace with failure
      await trace.complete({
        error: result.error?.message ?? "Step failed",
      });
    }

    return result;
  } catch (error) {
    // Complete trace with error
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await trace.complete({ error: errorMessage });

    return handleStepFailure(db, step, error, workerId);
  }
}

/**
 * Handle step failure with retry logic.
 */
async function handleStepFailure(
  db: Db,
  step: RunStepDocument,
  error: unknown,
  workerId: string
): Promise<StepExecutionResult> {
  const normalizedError = normalizeError(error);
  const maxRetries = 3; // Default max retries

  if (step.attempt < maxRetries) {
    // Schedule retry with exponential backoff
    const backoffMs = calculateBackoff(step.attempt);

    await scheduleStepRetry(step._id, normalizedError, backoffMs);

    await appendRunEvent({
      workspaceId: step.workspaceId,
      runId: step.runId,
      type: "STEP_RETRY_SCHEDULED",
      data: {
        stepId: step.stepId,
        attempt: step.attempt,
        nextRetryMs: backoffMs,
        error: normalizedError.message,
      },
      actor: { type: "system", id: workerId },
    });

    return { status: "retrying", error: normalizedError };
  }

  // Max retries exceeded - permanent failure
  await markStepFailed(step._id, normalizedError);

  await appendRunEvent({
    workspaceId: step.workspaceId,
    runId: step.runId,
    type: "STEP_FAILED",
    data: { stepId: step.stepId, error: normalizedError },
    actor: { type: "system", id: workerId },
  });

  // Mark run as failed
  await updateRunStatus(step.runId, "failed");

  await appendRunEvent({
    workspaceId: step.workspaceId,
    runId: step.runId,
    type: "RUN_FAILED",
    data: { reason: `Step ${step.stepId} failed after ${maxRetries} attempts` },
    actor: { type: "system", id: workerId },
  });

  return { status: "failed", error: normalizedError };
}
