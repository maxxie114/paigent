import { ObjectId } from "mongodb";
import {
  collections,
  RunDocument,
  RunGraph,
  RunStatus,
  RunBudget,
  RunInput,
  WorkspaceSettings,
} from "../collections";

/**
 * Run Query Helpers
 *
 * @description Database query functions for run operations.
 * All queries enforce workspace-level access control.
 */

/**
 * Create a new run.
 *
 * @param params - Run creation parameters.
 * @returns The created run document.
 */
export async function createRun(params: {
  workspaceId: ObjectId;
  createdByClerkUserId: string;
  input: RunInput;
  graph: RunGraph;
  budget: RunBudget;
  autoPayPolicy: WorkspaceSettings;
}): Promise<RunDocument> {
  const {
    workspaceId,
    createdByClerkUserId,
    input,
    graph,
    budget,
    autoPayPolicy,
  } = params;

  const runs = await collections.runs();
  const now = new Date();

  const run: RunDocument = {
    _id: new ObjectId(),
    workspaceId,
    createdByClerkUserId,
    status: "queued",
    input,
    graph,
    budget,
    autoPayPolicy,
    createdAt: now,
    updatedAt: now,
  };

  await runs.insertOne(run);
  return run;
}

/**
 * Get a run by ID.
 *
 * @param runId - The run ID.
 * @returns The run document or null if not found.
 */
export async function getRun(runId: ObjectId): Promise<RunDocument | null> {
  const runs = await collections.runs();
  return runs.findOne({ _id: runId });
}

/**
 * Get a run by ID with workspace verification.
 *
 * @param runId - The run ID.
 * @param workspaceId - The workspace ID for access control.
 * @returns The run document or null if not found or not in workspace.
 */
export async function getRunWithWorkspaceCheck(
  runId: ObjectId,
  workspaceId: ObjectId
): Promise<RunDocument | null> {
  const runs = await collections.runs();
  return runs.findOne({ _id: runId, workspaceId });
}

/**
 * Get runs for a workspace.
 *
 * @param workspaceId - The workspace ID.
 * @param options - Query options.
 * @returns Array of run documents.
 */
export async function getRunsForWorkspace(
  workspaceId: ObjectId,
  options?: {
    status?: RunStatus | RunStatus[];
    limit?: number;
    skip?: number;
  }
): Promise<RunDocument[]> {
  const runs = await collections.runs();

  const filter: Record<string, unknown> = { workspaceId };

  if (options?.status) {
    filter.status = Array.isArray(options.status)
      ? { $in: options.status }
      : options.status;
  }

  let cursor = runs.find(filter).sort({ createdAt: -1 });

  if (options?.skip) {
    cursor = cursor.skip(options.skip);
  }

  if (options?.limit) {
    cursor = cursor.limit(options.limit);
  }

  return cursor.toArray();
}

/**
 * Update run status.
 *
 * @param runId - The run ID.
 * @param status - The new status.
 * @returns True if updated, false if run not found.
 */
export async function updateRunStatus(
  runId: ObjectId,
  status: RunStatus
): Promise<boolean> {
  const runs = await collections.runs();

  const result = await runs.updateOne(
    { _id: runId },
    {
      $set: {
        status,
        updatedAt: new Date(),
      },
    }
  );

  return result.modifiedCount > 0;
}

/**
 * Update run budget spent amount.
 *
 * @param runId - The run ID.
 * @param spentAtomic - New spent amount in atomic units.
 * @returns True if updated, false if run not found.
 */
export async function updateRunBudgetSpent(
  runId: ObjectId,
  spentAtomic: string
): Promise<boolean> {
  const runs = await collections.runs();

  const result = await runs.updateOne(
    { _id: runId },
    {
      $set: {
        "budget.spentAtomic": spentAtomic,
        updatedAt: new Date(),
      },
    }
  );

  return result.modifiedCount > 0;
}

/**
 * Update run heartbeat.
 *
 * @description Called by the executor to indicate the run is still being processed.
 *
 * @param runId - The run ID.
 * @returns True if updated, false if run not found.
 */
export async function updateRunHeartbeat(runId: ObjectId): Promise<boolean> {
  const runs = await collections.runs();

  const result = await runs.updateOne(
    { _id: runId },
    {
      $set: {
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );

  return result.modifiedCount > 0;
}

/**
 * Get runs that appear to be stale (no heartbeat).
 *
 * @description Finds runs that are in "running" status but haven't had a heartbeat
 * in the specified timeout period. Used for detecting crashed executors.
 *
 * @param timeoutMs - Heartbeat timeout in milliseconds.
 * @returns Array of stale run documents.
 */
export async function getStaleRuns(timeoutMs: number): Promise<RunDocument[]> {
  const runs = await collections.runs();
  const cutoff = new Date(Date.now() - timeoutMs);

  return runs
    .find({
      status: "running",
      $or: [
        { lastHeartbeatAt: { $lt: cutoff } },
        { lastHeartbeatAt: { $exists: false } },
      ],
    })
    .toArray();
}

/**
 * Count runs by status for a workspace.
 *
 * @param workspaceId - The workspace ID.
 * @returns Object with counts by status.
 */
export async function countRunsByStatus(
  workspaceId: ObjectId
): Promise<Record<RunStatus, number>> {
  const runs = await collections.runs();

  const pipeline = [
    { $match: { workspaceId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ];

  const results = await runs.aggregate(pipeline).toArray();

  const counts: Record<RunStatus, number> = {
    draft: 0,
    queued: 0,
    running: 0,
    paused_for_approval: 0,
    succeeded: 0,
    failed: 0,
    canceled: 0,
  };

  for (const result of results) {
    const status = result._id as RunStatus;
    counts[status] = result.count;
  }

  return counts;
}
