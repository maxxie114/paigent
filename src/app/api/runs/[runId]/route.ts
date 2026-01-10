/**
 * Run Detail API Route
 *
 * @description Handles individual run operations (get, update, cancel).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";

import { collections } from "@/lib/db/collections";
import { verifyMembership } from "@/lib/db/queries/workspaces";
import { getRun, updateRunStatus } from "@/lib/db/queries/runs";
import { getStepsForRun } from "@/lib/db/queries/steps";
import { appendRunEvent } from "@/lib/db/queries/events";
import { UpdateRunStatusRequestSchema } from "@/types/api";

/**
 * Route params type.
 */
type RouteParams = {
  params: Promise<{ runId: string }>;
};

/**
 * GET /api/runs/[runId]
 *
 * @description Gets a single run with its steps.
 */
export async function GET(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    // Authenticate
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

    // Get steps
    const steps = await getStepsForRun(runObjectId);

    return NextResponse.json({
      success: true,
      data: {
        id: run._id.toString(),
        workspaceId: run.workspaceId.toString(),
        status: run.status,
        input: {
          text: run.input.text,
          voiceTranscript: run.input.voiceTranscript,
        },
        graph: run.graph,
        budget: {
          asset: run.budget.asset,
          network: run.budget.network,
          maxAtomic: run.budget.maxAtomic,
          spentAtomic: run.budget.spentAtomic,
        },
        steps: steps.map((step) => ({
          id: step._id.toString(),
          stepId: step.stepId,
          nodeType: step.nodeType,
          status: step.status,
          attempt: step.attempt,
          inputs: step.inputs,
          outputs: step.outputs,
          error: step.error,
          metrics: step.metrics,
          createdAt: step.createdAt.toISOString(),
          updatedAt: step.updatedAt.toISOString(),
        })),
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error getting run:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get run",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/runs/[runId]
 *
 * @description Updates run status (cancel, pause, resume).
 */
export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    // Authenticate
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
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Insufficient permissions" },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const parseResult = UpdateRunStatusRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          details: parseResult.error.format(),
        },
        { status: 400 }
      );
    }

    const { status: newStatus } = parseResult.data;

    // Validate status transition
    const validTransitions: Record<string, string[]> = {
      queued: ["running", "canceled"],
      running: ["paused_for_approval", "succeeded", "failed", "canceled"],
      paused_for_approval: ["running", "canceled"],
    };

    if (!validTransitions[run.status]?.includes(newStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid status transition from ${run.status} to ${newStatus}`,
        },
        { status: 400 }
      );
    }

    // Update status
    await updateRunStatus(runObjectId, newStatus);

    // Append event
    const eventType = newStatus === "canceled"
      ? "RUN_CANCELED"
      : newStatus === "paused_for_approval"
      ? "RUN_PAUSED"
      : newStatus === "running"
      ? "RUN_RESUMED"
      : "RUN_STARTED";

    await appendRunEvent({
      workspaceId: run.workspaceId,
      runId: runObjectId,
      type: eventType as never,
      data: { previousStatus: run.status, newStatus },
      actor: { type: "user", id: userId },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: run._id.toString(),
        status: newStatus,
      },
    });
  } catch (error) {
    console.error("Error updating run:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update run",
      },
      { status: 500 }
    );
  }
}
