/**
 * Tool Detail API Route
 *
 * @description API endpoints for individual tool operations (get, update, delete).
 *
 * @see paigent-studio-spec.md Section 7.2.3
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";

import { verifyMembership } from "@/lib/db/queries/workspaces";
import {
  getToolById,
  updateTool,
  deleteWorkspaceTool,
} from "@/lib/db/queries/tools";

/**
 * Route params type.
 */
type RouteParams = {
  params: Promise<{ toolId: string }>;
};

// =============================================================================
// GET /api/tools/[toolId] - Get a specific tool
// =============================================================================

/**
 * GET /api/tools/[toolId]
 *
 * @description Retrieves details for a specific tool.
 *
 * @param req - The incoming Next.js request object.
 * @param params - Route parameters containing the tool ID.
 * @returns JSON response with tool details.
 */
export async function GET(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { toolId } = await params;

    // Validate toolId format
    if (!ObjectId.isValid(toolId)) {
      return NextResponse.json(
        { success: false, error: "Invalid tool ID format" },
        { status: 400 }
      );
    }

    const toolObjectId = new ObjectId(toolId);

    // Get the tool first to check its workspace
    const tool = await getToolById(toolObjectId);
    if (!tool) {
      return NextResponse.json(
        { success: false, error: "Tool not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    const membership = await verifyMembership(userId, tool.workspaceId);
    if (!membership) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Not a member of this workspace" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      tool: {
        id: tool._id.toString(),
        workspaceId: tool.workspaceId.toString(),
        name: tool.name,
        description: tool.description,
        baseUrl: tool.baseUrl,
        source: tool.source,
        endpoints: tool.endpoints,
        reputation: tool.reputation,
        pricingHints: tool.pricingHints,
        createdAt: tool.createdAt.toISOString(),
        updatedAt: tool.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[Tools API] GET [toolId] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// =============================================================================
// PATCH /api/tools/[toolId] - Update a tool
// =============================================================================

/**
 * PATCH /api/tools/[toolId]
 *
 * @description Updates a specific tool. Only works for manual tools.
 *
 * Request Body:
 * - name (optional): Updated name
 * - description (optional): Updated description
 * - endpoints (optional): Updated endpoints array
 *
 * @param req - The incoming Next.js request object.
 * @param params - Route parameters containing the tool ID.
 * @returns JSON response with updated tool.
 */
export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { toolId } = await params;

    // Validate toolId format
    if (!ObjectId.isValid(toolId)) {
      return NextResponse.json(
        { success: false, error: "Invalid tool ID format" },
        { status: 400 }
      );
    }

    const toolObjectId = new ObjectId(toolId);

    // Get the tool first to check its workspace and source
    const existingTool = await getToolById(toolObjectId);
    if (!existingTool) {
      return NextResponse.json(
        { success: false, error: "Tool not found" },
        { status: 404 }
      );
    }

    // Verify user has write access to this workspace
    const membership = await verifyMembership(userId, existingTool.workspaceId);
    if (!membership || membership.role === "viewer") {
      return NextResponse.json(
        { success: false, error: "Forbidden: Insufficient permissions" },
        { status: 403 }
      );
    }

    // Only allow updating manual tools
    if (existingTool.source === "bazaar") {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot manually edit Bazaar-sourced tools. Resync from Bazaar to update.",
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name, description, endpoints } = body;

    // Build update object
    const updateData: {
      name?: string;
      description?: string;
      endpoints?: typeof existingTool.endpoints;
    } = {};

    if (name !== undefined && typeof name === "string" && name.trim()) {
      updateData.name = name.trim();
    }
    if (description !== undefined && typeof description === "string") {
      updateData.description = description.trim();
    }
    if (endpoints !== undefined && Array.isArray(endpoints)) {
      updateData.endpoints = endpoints;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Update the tool
    const updatedTool = await updateTool(toolObjectId, updateData);
    if (!updatedTool) {
      return NextResponse.json(
        { success: false, error: "Failed to update tool" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      tool: {
        id: updatedTool._id.toString(),
        name: updatedTool.name,
        description: updatedTool.description,
        baseUrl: updatedTool.baseUrl,
        source: updatedTool.source,
        endpoints: updatedTool.endpoints,
        reputation: updatedTool.reputation,
        pricingHints: updatedTool.pricingHints,
        createdAt: updatedTool.createdAt.toISOString(),
        updatedAt: updatedTool.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[Tools API] PATCH [toolId] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// =============================================================================
// DELETE /api/tools/[toolId] - Delete a tool
// =============================================================================

/**
 * DELETE /api/tools/[toolId]
 *
 * @description Deletes a specific tool from the workspace.
 *
 * Query Parameters:
 * - workspaceId (optional): Workspace ID for authorization check
 *
 * @param req - The incoming Next.js request object.
 * @param params - Route parameters containing the tool ID.
 * @returns JSON response indicating success or failure.
 */
export async function DELETE(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { toolId } = await params;

    // Validate toolId format
    if (!ObjectId.isValid(toolId)) {
      return NextResponse.json(
        { success: false, error: "Invalid tool ID format" },
        { status: 400 }
      );
    }

    const toolObjectId = new ObjectId(toolId);

    // Get the tool first to check its workspace
    const tool = await getToolById(toolObjectId);
    if (!tool) {
      return NextResponse.json(
        { success: false, error: "Tool not found" },
        { status: 404 }
      );
    }

    // Verify user has write access to this workspace
    const membership = await verifyMembership(userId, tool.workspaceId);
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Only owners and admins can delete tools" },
        { status: 403 }
      );
    }

    // Delete the tool
    const deleted = await deleteWorkspaceTool(tool.workspaceId, toolObjectId);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Failed to delete tool" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Tool "${tool.name}" deleted successfully`,
    });
  } catch (error) {
    console.error("[Tools API] DELETE [toolId] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
