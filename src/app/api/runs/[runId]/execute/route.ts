/**
 * Run Execute API Route
 *
 * @description Triggers execution of queued steps for a specific run.
 * This endpoint allows UI-triggered workflow execution without requiring
 * the CRON_SECRET authentication used by the automated cron tick.
 *
 * @see src/app/api/cron/tick/route.ts for the automated cron-based execution
 * @see paigent-studio-spec.md Section 14.2
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";
import crypto from "crypto";
import pLimit from "p-limit";

import { getDb } from "@/lib/db/client";
import { RunStepDocument } from "@/lib/db/collections";
import { verifyMembership } from "@/lib/db/queries/workspaces";
import { getRun, updateRunStatus } from "@/lib/db/queries/runs";
import { appendRunEvent } from "@/lib/db/queries/events";
import { executeStep } from "@/lib/agents/executor";

/**
 * Maximum steps to execute per request.
 * Limits execution to prevent timeout issues.
 */
const MAX_STEPS_PER_EXECUTION = 10;

/**
 * Maximum concurrent step executions.
 * Set to 1 because Galileo tracing doesn't support concurrent traces.
 */
const MAX_CONCURRENCY = 1;

/**
 * Route params type.
 */
type RouteParams = {
  params: Promise<{ runId: string }>;
};

/**
 * POST /api/runs/[runId]/execute
 *
 * @description Executes queued steps for the specified run.
 * Claims and processes up to MAX_STEPS_PER_EXECUTION steps for this run.
 *
 * Authentication: Requires Clerk user session and workspace membership.
 * This endpoint is designed for UI-triggered execution, not automated cron jobs.
 *
 * @param req - The incoming Next.js request object.
 * @param params - Route parameters containing the run ID.
 * @returns JSON response with execution results including counts of succeeded/failed/blocked steps.
 *
 * @example
 * ```typescript
 * // Client-side usage
 * const response = await fetch(`/api/runs/${runId}/execute`, {
 *   method: 'POST',
 * });
 * const result = await response.json();
 * // result: { success: true, claimed: 3, succeeded: 2, failed: 0, blocked: 1, ... }
 * ```
 */
export async function POST(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { runId } = await params;

    // Validate runId format
    if (!ObjectId.isValid(runId)) {
      return NextResponse.json(
        { success: false, error: "Invalid run ID format" },
        { status: 400 }
      );
    }

    const runObjectId = new ObjectId(runId);

    // Get run
    const run = await getRun(runObjectId);
    if (!run) {
      return NextResponse.json(
        { success: false, error: "Run not found" },
        { status: 404 }
      );
    }

    // Verify workspace membership
    const membership = await verifyMembership(userId, run.workspaceId);
    if (!membership) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Not a member of this workspace" },
        { status: 403 }
      );
    }

    // Check run status - only execute if run is in an executable state
    const executableStatuses = ["queued", "running", "paused_for_approval"];
    if (!executableStatuses.includes(run.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Run is in '${run.status}' status and cannot be executed`,
        },
        { status: 400 }
      );
    }

    // Update run status to 'running' if it was 'queued'
    if (run.status === "queued") {
      await updateRunStatus(runObjectId, "running");
      await appendRunEvent({
        workspaceId: run.workspaceId,
        runId: runObjectId,
        type: "RUN_STARTED",
        data: { triggeredBy: "user", previousStatus: run.status },
        actor: { type: "user", id: userId },
      });
    }

    // Get database connection and generate worker ID
    const db = await getDb();
    const workerId = `user-${userId}-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date();

    // Reset any stuck "running" steps that have been running for more than 5 minutes
    // This handles steps that errored during concurrent execution but weren't properly cleaned up
    const stuckStepThreshold = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago
    const resetResult = await db.collection<RunStepDocument>("run_steps").updateMany(
      {
        runId: runObjectId,
        status: "running",
        "lockedBy.lockedAt": { $lt: stuckStepThreshold },
      },
      {
        $set: {
          status: "queued",
          updatedAt: now,
        },
        $unset: { lockedBy: "" },
      }
    );

    if (resetResult.modifiedCount > 0) {
      console.log(`[Execute] Reset ${resetResult.modifiedCount} stuck running steps for run ${runId}`);
    }

    // Claim queued steps for this specific run
    const claimedSteps: RunStepDocument[] = [];
    for (let i = 0; i < MAX_STEPS_PER_EXECUTION; i++) {
      // Use findOneAndUpdate to atomically claim a step for this run
      const step = await db.collection<RunStepDocument>("run_steps").findOneAndUpdate(
        {
          runId: runObjectId,
          status: "queued",
          $or: [
            { nextEligibleAt: { $exists: false } },
            { nextEligibleAt: { $lte: now } },
          ],
        },
        {
          $set: {
            status: "running",
            lockedBy: { workerId, lockedAt: now },
            updatedAt: now,
          },
          $inc: { attempt: 1 },
        },
        {
          sort: { updatedAt: 1 },
          returnDocument: "after",
          includeResultMetadata: false,
        }
      );

      if (!step) break;
      claimedSteps.push(step);
    }

    // Early return if no queued steps available
    if (claimedSteps.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No queued steps available to execute",
        claimed: 0,
        succeeded: 0,
        failed: 0,
        retrying: 0,
        blocked: 0,
        latencyMs: Date.now() - startTime,
      });
    }

    // Execute claimed steps with concurrency limit
    const limit = pLimit(MAX_CONCURRENCY);

    const results = await Promise.all(
      claimedSteps.map((step) =>
        limit(async () => {
          try {
            console.log(`[Execute] Running step ${step.stepId} for run ${runId}`);
            return await executeStep(db, step, workerId);
          } catch (error) {
            console.error(`[Execute] Error executing step ${step.stepId}:`, error);
            return {
              status: "failed" as const,
              error: {
                code: "EXECUTION_ERROR",
                message: error instanceof Error ? error.message : "Unknown error",
              },
            };
          }
        })
      )
    );

    // Aggregate result counts
    const counts = {
      succeeded: 0,
      failed: 0,
      retrying: 0,
      blocked: 0,
    };

    for (const result of results) {
      const status = result.status as keyof typeof counts;
      if (status in counts) {
        counts[status]++;
      }
    }

    // Log execution event
    await appendRunEvent({
      workspaceId: run.workspaceId,
      runId: runObjectId,
      type: "STEPS_EXECUTED",
      data: {
        claimed: claimedSteps.length,
        ...counts,
        latencyMs: Date.now() - startTime,
      },
      actor: { type: "user", id: userId },
    });

    return NextResponse.json({
      success: true,
      message: `Executed ${claimedSteps.length} step(s)`,
      claimed: claimedSteps.length,
      ...counts,
      latencyMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("[Execute] Run execution error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to execute run",
        latencyMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
