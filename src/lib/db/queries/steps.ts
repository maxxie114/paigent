import { ObjectId, Db } from "mongodb";
import {
  collections,
  RunStepDocument,
  StepStatus,
  StepError,
  StepLock,
  RunGraph,
} from "../collections";

/**
 * Step Query Helpers
 *
 * @description Database query functions for run step operations.
 * Includes atomic claim pattern for distributed execution.
 *
 * @see https://www.mongodb.com/docs/drivers/node/current/usage-examples/findOneAndUpdate/
 */

/**
 * Create steps from a run graph.
 *
 * @description Creates step documents for each node in the run graph.
 * Initial status is "queued" for the entry node, "blocked" for others.
 *
 * @param runId - The run ID.
 * @param workspaceId - The workspace ID.
 * @param graph - The run graph.
 * @returns Array of created step documents.
 */
export async function createStepsFromGraph(
  runId: ObjectId,
  workspaceId: ObjectId,
  graph: RunGraph
): Promise<RunStepDocument[]> {
  const steps = await collections.runSteps();
  const now = new Date();

  // Determine which nodes can start immediately (entry node and nodes with no dependencies)
  const entryNodeId = graph.entryNodeId;
  const nodesWithIncomingEdges = new Set(graph.edges.map((e) => e.to));

  const stepDocs: RunStepDocument[] = graph.nodes.map((node) => {
    // A node is ready to run if:
    // 1. It's the entry node, OR
    // 2. It has no explicit dependencies AND no incoming edges
    const isReady =
      node.id === entryNodeId ||
      (!node.dependsOn?.length && !nodesWithIncomingEdges.has(node.id));

    return {
      _id: new ObjectId(),
      workspaceId,
      runId,
      stepId: node.id,
      nodeType: node.type,
      status: isReady ? ("queued" as StepStatus) : ("blocked" as StepStatus),
      attempt: 0,
      createdAt: now,
      updatedAt: now,
    };
  });

  if (stepDocs.length > 0) {
    await steps.insertMany(stepDocs);
  }

  return stepDocs;
}

/**
 * Claim the next queued step atomically.
 *
 * @description Uses findOneAndUpdate with atomic operations to claim a step
 * for execution. This prevents multiple workers from claiming the same step.
 *
 * Important: In MongoDB Node.js driver v6, the default return type is a ModifyResult.
 * Setting includeResultMetadata: false returns the document directly (or null).
 *
 * @param params - Claim parameters.
 * @returns The claimed step document or null if none available.
 *
 * @see https://www.mongodb.com/docs/drivers/node/current/usage-examples/findOneAndUpdate/
 */
export async function claimNextQueuedStep(params: {
  db: Db;
  workspaceId?: ObjectId;
  workerId: string;
  now: Date;
}): Promise<RunStepDocument | null> {
  const { db, workspaceId, workerId, now } = params;

  const filter: Record<string, unknown> = {
    status: "queued",
    $or: [
      { nextEligibleAt: { $exists: false } },
      { nextEligibleAt: { $lte: now } },
    ],
  };

  if (workspaceId) {
    filter.workspaceId = workspaceId;
  }

  const result = await db.collection<RunStepDocument>("run_steps").findOneAndUpdate(
    filter,
    {
      $set: {
        status: "running" as StepStatus,
        lockedBy: { workerId, lockedAt: now } as StepLock,
        updatedAt: now,
      },
      $inc: { attempt: 1 },
    },
    {
      sort: { updatedAt: 1 },
      returnDocument: "after",
      includeResultMetadata: false, // Critical for MongoDB driver v6
    }
  );

  return result;
}

/**
 * Get a step by ID.
 *
 * @param stepId - The step's ObjectId.
 * @returns The step document or null if not found.
 */
export async function getStep(stepId: ObjectId): Promise<RunStepDocument | null> {
  const steps = await collections.runSteps();
  return steps.findOne({ _id: stepId });
}

/**
 * Get a step by run ID and step ID.
 *
 * @param runId - The run ID.
 * @param stepId - The step ID (node ID from graph).
 * @returns The step document or null if not found.
 */
export async function getStepByRunAndStepId(
  runId: ObjectId,
  stepId: string
): Promise<RunStepDocument | null> {
  const steps = await collections.runSteps();
  return steps.findOne({ runId, stepId });
}

/**
 * Get all steps for a run.
 *
 * @param runId - The run ID.
 * @returns Array of step documents.
 */
export async function getStepsForRun(runId: ObjectId): Promise<RunStepDocument[]> {
  const steps = await collections.runSteps();
  return steps.find({ runId }).toArray();
}

/**
 * Update step to succeeded status.
 *
 * @param stepId - The step's ObjectId.
 * @param outputs - The step's output data.
 * @param metrics - Execution metrics.
 * @returns True if updated, false if not found.
 */
export async function markStepSucceeded(
  stepId: ObjectId,
  outputs: Record<string, unknown>,
  metrics?: { latencyMs?: number; tokens?: { input: number; output: number }; costAtomic?: string }
): Promise<boolean> {
  const steps = await collections.runSteps();

  const result = await steps.updateOne(
    { _id: stepId },
    {
      $set: {
        status: "succeeded" as StepStatus,
        outputs,
        metrics,
        updatedAt: new Date(),
      },
      $unset: { lockedBy: "" },
    }
  );

  return result.modifiedCount > 0;
}

/**
 * Update step to failed status.
 *
 * @param stepId - The step's ObjectId.
 * @param error - The error information.
 * @returns True if updated, false if not found.
 */
export async function markStepFailed(
  stepId: ObjectId,
  error: StepError
): Promise<boolean> {
  const steps = await collections.runSteps();

  const result = await steps.updateOne(
    { _id: stepId },
    {
      $set: {
        status: "failed" as StepStatus,
        error,
        updatedAt: new Date(),
      },
      $unset: { lockedBy: "" },
    }
  );

  return result.modifiedCount > 0;
}

/**
 * Schedule step for retry with exponential backoff.
 *
 * @param stepId - The step's ObjectId.
 * @param error - The error that caused the retry.
 * @param backoffMs - Backoff duration in milliseconds.
 * @returns True if updated, false if not found.
 */
export async function scheduleStepRetry(
  stepId: ObjectId,
  error: StepError,
  backoffMs: number
): Promise<boolean> {
  const steps = await collections.runSteps();
  const nextEligibleAt = new Date(Date.now() + backoffMs);

  const result = await steps.updateOne(
    { _id: stepId },
    {
      $set: {
        status: "queued" as StepStatus,
        nextEligibleAt,
        error,
        updatedAt: new Date(),
      },
      $unset: { lockedBy: "" },
    }
  );

  return result.modifiedCount > 0;
}

/**
 * Mark step as blocked (waiting for approval or dependency).
 *
 * @param stepId - The step's ObjectId.
 * @param reason - The reason for blocking.
 * @returns True if updated, false if not found.
 */
export async function markStepBlocked(
  stepId: ObjectId,
  reason: string
): Promise<boolean> {
  const steps = await collections.runSteps();

  const result = await steps.updateOne(
    { _id: stepId },
    {
      $set: {
        status: "blocked" as StepStatus,
        "error.message": reason,
        updatedAt: new Date(),
      },
      $unset: { lockedBy: "" },
    }
  );

  return result.modifiedCount > 0;
}

/**
 * Unblock a step (after approval or dependency resolution).
 *
 * @param stepId - The step's ObjectId.
 * @returns True if updated, false if not found.
 */
export async function unblockStep(stepId: ObjectId): Promise<boolean> {
  const steps = await collections.runSteps();

  const result = await steps.updateOne(
    { _id: stepId, status: "blocked" },
    {
      $set: {
        status: "queued" as StepStatus,
        updatedAt: new Date(),
      },
      $unset: { error: "" },
    }
  );

  return result.modifiedCount > 0;
}

/**
 * Unblock steps that depend on a completed step.
 *
 * @description After a step succeeds, unblock any downstream steps
 * that were waiting for it.
 *
 * @param runId - The run ID.
 * @param completedStepId - The step ID that just completed.
 * @param graph - The run graph for determining dependencies.
 * @returns Number of steps unblocked.
 */
export async function unblockDependentSteps(
  runId: ObjectId,
  completedStepId: string,
  graph: { nodes: Array<{ id: string; dependsOn?: string[] }>; edges: Array<{ from: string; to: string; type: string }> }
): Promise<number> {
  const allSteps = await getStepsForRun(runId);

  // Find nodes that have the completed step as a dependency
  const successEdges = graph.edges.filter(
    (e) => e.from === completedStepId && e.type === "success"
  );
  const targetNodeIds = successEdges.map((e) => e.to);

  // Also check explicit dependsOn
  const nodesWithExplicitDep = graph.nodes
    .filter((n) => n.dependsOn?.includes(completedStepId))
    .map((n) => n.id);

  const allTargets = [...new Set([...targetNodeIds, ...nodesWithExplicitDep])];

  if (allTargets.length === 0) {
    return 0;
  }

  // Check if all dependencies are satisfied for each target
  let unblocked = 0;
  for (const targetId of allTargets) {
    const targetNode = graph.nodes.find((n) => n.id === targetId);
    if (!targetNode) continue;

    // Get all dependencies for this node
    const incomingEdges = graph.edges
      .filter((e) => e.to === targetId && e.type === "success")
      .map((e) => e.from);
    const explicitDeps = targetNode.dependsOn || [];
    const allDeps = [...new Set([...incomingEdges, ...explicitDeps])];

    // Check if all dependencies are satisfied
    const allSatisfied = allDeps.every((depId) => {
      const depStep = allSteps.find((s) => s.stepId === depId);
      return depStep?.status === "succeeded";
    });

    if (allSatisfied) {
      const targetStep = allSteps.find((s) => s.stepId === targetId);
      if (targetStep && targetStep.status === "blocked") {
        const success = await unblockStep(targetStep._id);
        if (success) unblocked++;
      }
    }
  }

  return unblocked;
}

/**
 * Check if all steps in a run are complete.
 *
 * @param runId - The run ID.
 * @returns Object with completion status and counts.
 */
export async function checkRunCompletion(runId: ObjectId): Promise<{
  complete: boolean;
  succeeded: number;
  failed: number;
  pending: number;
  blocked: number;
}> {
  const steps = await collections.runSteps();

  const pipeline = [
    { $match: { runId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ];

  const results = await steps.aggregate(pipeline).toArray();

  const counts = {
    succeeded: 0,
    failed: 0,
    queued: 0,
    running: 0,
    blocked: 0,
  };

  for (const result of results) {
    const status = result._id as StepStatus;
    if (status in counts) {
      counts[status as keyof typeof counts] = result.count;
    }
  }

  const pending = counts.queued + counts.running;
  const complete = pending === 0 && counts.blocked === 0;

  return {
    complete,
    succeeded: counts.succeeded,
    failed: counts.failed,
    pending,
    blocked: counts.blocked,
  };
}
