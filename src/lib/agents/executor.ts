/**
 * Step Executor Agent
 *
 * @description Executes individual workflow steps based on their node type.
 * Handles tool calls, LLM reasoning, approvals, and other node types.
 * Includes Galileo observability for tracing step executions.
 *
 * @see paigent-studio-spec.md Section 14
 */

import { Db } from "mongodb";
import {
  RunStepDocument,
  RunDocument,
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
import { callLLM, FIREWORKS_MODELS } from "@/lib/fireworks/client";
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
 * @description Makes an HTTP request to the tool endpoint.
 * Handles x402 payment flows when required.
 */
 
async function executeToolCall(
  _db: Db,
  step: RunStepDocument,
  _run: RunDocument,
  _workerId: string
): Promise<StepExecutionResult> {
   
  const startTime = Date.now();

  // For now, simulate tool call execution
  // In production, this would make actual HTTP requests with x402 handling
  // The x402 integration is implemented in lib/cdp/x402-fetch.ts

  // Simulate some processing time
  await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));

  // Return simulated success
  return {
    status: "succeeded",
    result: {
      message: `Tool call ${step.stepId} executed successfully`,
      timestamp: new Date().toISOString(),
    },
    metrics: {
      latencyMs: Date.now() - startTime,
    },
  };
}

/**
 * Execute an llm_reason step.
 *
 * @description Calls the LLM for analysis, summarization, or decision-making.
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

    const systemPrompt = (node as { systemPrompt?: string }).systemPrompt ||
      "You are a helpful assistant in a workflow orchestration system.";

    const userPromptTemplate = (node as { userPromptTemplate?: string }).userPromptTemplate ||
      "Process the following input and provide analysis.";

    // Get inputs from previous steps
    const inputs = step.inputs || {};
    const userPrompt = Object.entries(inputs)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n");

    const fullUserPrompt = userPromptTemplate + "\n\n" + userPrompt;

    // Call LLM with Galileo logging enabled for this reasoning step
    const response = await callLLM(
      {
        systemPrompt,
        userPrompt: fullUserPrompt,
        model: FIREWORKS_MODELS.GLM_4_9B,
        maxTokens: 2048,
        temperature: 0.7,
      },
      {
        spanName: `LLM Reason: ${step.stepId}`,
        tags: ["llm_reason", "executor", "reasoning"],
        metadata: {
          stepId: step.stepId,
          runId: step.runId.toString(),
          nodeLabel: (node as { label?: string }).label ?? step.stepId,
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

    return {
      status: "succeeded",
      result,
      metrics: {
        latencyMs: Date.now() - startTime,
        tokensUsed: response.usage.totalTokens,
      },
    };
  } catch (error) {
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
