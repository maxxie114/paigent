/**
 * Runs API Route
 *
 * @description Handles run creation and listing.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/collections";
import { verifyMembership, getWorkspace } from "@/lib/db/queries/workspaces";
import { createRun, getRunsForWorkspace } from "@/lib/db/queries/runs";
import { createStepsFromGraph } from "@/lib/db/queries/steps";
import { appendRunEvent } from "@/lib/db/queries/events";
import { planWorkflow, createFallbackGraph } from "@/lib/agents/planner";
import { CreateRunRequestSchema } from "@/types/api";

/**
 * POST /api/runs
 *
 * @description Creates a new workflow run from user intent.
 * Generates a workflow graph using the Planner agent.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const parseResult = CreateRunRequestSchema.safeParse(body);

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

    const { workspaceId, intent, voiceTranscript, budgetMaxAtomic } = parseResult.data;
    const workspaceObjectId = new ObjectId(workspaceId);

    // Verify workspace membership
    const membership = await verifyMembership(userId, workspaceObjectId);
    if (!membership) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Not a member of this workspace" },
        { status: 403 }
      );
    }

    // Get workspace settings
    const workspace = await getWorkspace(workspaceObjectId);
    if (!workspace) {
      return NextResponse.json(
        { success: false, error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get available tools for this workspace
    const toolsCollection = await collections.tools();
    const availableTools = await toolsCollection
      .find({ workspaceId: workspaceObjectId })
      .toArray();

    // Generate workflow graph using Planner agent
    console.log(`[Planner] Starting workflow planning for intent: "${intent.slice(0, 100)}..."`);
    
    const planResult = await planWorkflow({
      intent,
      availableTools,
      workspaceSettings: workspace.settings,
      maxBudgetAtomic: budgetMaxAtomic,
    });

    // Log planning result for debugging
    console.log(`[Planner] Result:`, {
      success: planResult.success,
      attempts: planResult.attempts,
      totalLatencyMs: planResult.totalLatencyMs,
      error: planResult.error,
      nodeCount: planResult.graph?.nodes.length ?? 0,
    });

    // Determine if planning failed and what graph/status to use
    const planningFailed = !planResult.success || !planResult.graph;
    // Non-null assertion is safe here: planningFailed being false guarantees planResult.graph exists
    const graph = planningFailed
      ? createFallbackGraph(intent, planResult.error || "Planning failed - unable to generate workflow")
      : planResult.graph!;

    // Create run document - mark as failed immediately if planning failed
    const run = await createRun({
      workspaceId: workspaceObjectId,
      createdByClerkUserId: userId,
      input: {
        text: intent,
        voiceTranscript,
      },
      graph,
      budget: {
        asset: "USDC",
        network: "eip155:84532", // Base Sepolia
        maxAtomic: budgetMaxAtomic || workspace.settings.autoPayMaxPerRunAtomic,
        spentAtomic: "0",
      },
      autoPayPolicy: workspace.settings,
      // Mark as failed if planning failed to prevent queuing a useless workflow
      initialStatus: planningFailed ? "failed" : undefined,
    });

    // Create step documents from graph - mark as failed if planning failed
    await createStepsFromGraph(run._id, workspaceObjectId, graph, {
      markAsFailed: planningFailed,
      failureReason: planResult.error || "Planning failed - unable to generate workflow",
    });

    // Append run created event
    await appendRunEvent({
      workspaceId: workspaceObjectId,
      runId: run._id,
      type: planningFailed ? "RUN_PLANNING_FAILED" : "RUN_CREATED",
      data: {
        intent,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        planningAttempts: planResult.attempts,
        planningLatencyMs: planResult.totalLatencyMs,
        planningError: planResult.error,
      },
      actor: { type: "user", id: userId },
    });

    // If planning failed, also append a failure event
    if (planningFailed) {
      await appendRunEvent({
        workspaceId: workspaceObjectId,
        runId: run._id,
        type: "RUN_FAILED",
        data: {
          reason: planResult.error || "Planning failed - unable to generate workflow",
          stage: "planning",
        },
        actor: { type: "system", id: "planner" },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        runId: run._id.toString(),
        status: planningFailed ? "failed" : run.status,
        graph,
        planning: {
          success: planResult.success,
          attempts: planResult.attempts,
          latencyMs: planResult.totalLatencyMs,
          error: planResult.error,
        },
      },
    });
  } catch (error) {
    console.error("Error creating run:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create run",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/runs
 *
 * @description Lists runs for a workspace.
 * Query params: workspaceId (required), status (optional), page, pageSize
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);

    if (!workspaceId) {
      return NextResponse.json(
        { success: false, error: "workspaceId is required" },
        { status: 400 }
      );
    }

    const workspaceObjectId = new ObjectId(workspaceId);

    // Verify workspace membership
    const membership = await verifyMembership(userId, workspaceObjectId);
    if (!membership) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Not a member of this workspace" },
        { status: 403 }
      );
    }

    // Fetch runs
    const runs = await getRunsForWorkspace(workspaceObjectId, {
      status: status as never,
      limit: pageSize,
      skip: (page - 1) * pageSize,
    });

    // Get total count
    const runsCollection = await collections.runs();
    const filter: Record<string, unknown> = { workspaceId: workspaceObjectId };
    if (status) filter.status = status;
    const total = await runsCollection.countDocuments(filter);

    return NextResponse.json({
      success: true,
      data: {
        runs: runs.map((run) => ({
          id: run._id.toString(),
          status: run.status,
          input: { text: run.input.text },
          budget: {
            spentAtomic: run.budget.spentAtomic,
            maxAtomic: run.budget.maxAtomic,
          },
          createdAt: run.createdAt.toISOString(),
          updatedAt: run.updatedAt.toISOString(),
        })),
        total,
        page,
        pageSize,
        hasMore: page * pageSize < total,
      },
    });
  } catch (error) {
    console.error("Error listing runs:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list runs",
      },
      { status: 500 }
    );
  }
}
