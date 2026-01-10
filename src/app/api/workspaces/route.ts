/**
 * Workspaces API Route
 *
 * @description Handles workspace listing and creation.
 * Each authenticated user has at least one default workspace.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import {
  getWorkspacesForUser,
  getOrCreateDefaultWorkspace,
  createWorkspace,
} from "@/lib/db/queries/workspaces";
import { CreateWorkspaceRequestSchema } from "@/types/api";

/**
 * GET /api/workspaces
 *
 * @description Gets all workspaces for the authenticated user.
 * If the user has no workspaces, creates and returns a default one.
 * @returns List of workspaces the user belongs to.
 */
export async function GET(): Promise<NextResponse> {
  try {
    // Authenticate
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user's workspaces
    let workspaces = await getWorkspacesForUser(userId);

    // If user has no workspaces, create a default one
    if (workspaces.length === 0) {
      const user = await currentUser();
      const userName =
        user?.firstName || user?.username || user?.emailAddresses?.[0]?.emailAddress?.split("@")[0];
      const defaultWorkspace = await getOrCreateDefaultWorkspace(userId, userName);
      workspaces = [defaultWorkspace];
    }

    return NextResponse.json({
      success: true,
      data: {
        workspaces: workspaces.map((ws) => ({
          id: ws._id.toString(),
          name: ws.name,
          settings: ws.settings,
          createdAt: ws.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching workspaces:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch workspaces",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces
 *
 * @description Creates a new workspace for the authenticated user.
 * @returns The created workspace.
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
    const parseResult = CreateWorkspaceRequestSchema.safeParse(body);

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

    const { name } = parseResult.data;

    // Create workspace
    const workspace = await createWorkspace({
      name,
      ownerClerkUserId: userId,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: workspace._id.toString(),
        name: workspace.name,
        settings: workspace.settings,
        createdAt: workspace.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error creating workspace:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create workspace",
      },
      { status: 500 }
    );
  }
}
