/**
 * Tools API Route
 *
 * @description API endpoints for managing tools (manual + Bazaar-sourced).
 * Supports listing, creating, and syncing tools from the x402 Bazaar.
 *
 * @see paigent-studio-spec.md Section 4.1 (Tool Marketplace)
 * @see https://docs.cdp.coinbase.com/x402/bazaar
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";

import { verifyMembership, getWorkspaceForUser } from "@/lib/db/queries/workspaces";
import {
  listWorkspaceTools,
  createTool,
  upsertToolByBaseUrl,
  countToolsBySource,
} from "@/lib/db/queries/tools";
import { fetchBazaarAsTools } from "@/lib/cdp/bazaar";
import { CreateToolSchema } from "@/types/database";

// =============================================================================
// GET /api/tools - List tools for a workspace
// =============================================================================

/**
 * GET /api/tools
 *
 * @description Lists all tools for the user's workspace with optional filtering.
 *
 * Query Parameters:
 * - workspaceId (optional): Specific workspace ID. Uses default workspace if not provided.
 * - source (optional): Filter by "bazaar" or "manual".
 * - search (optional): Search by name or description.
 * - page (optional): Page number for pagination (default: 1).
 * - pageSize (optional): Items per page (default: 50).
 *
 * @param req - The incoming Next.js request object.
 * @returns JSON response with paginated tool list.
 *
 * @example
 * ```typescript
 * // List all tools
 * const response = await fetch("/api/tools");
 *
 * // Filter by source
 * const response = await fetch("/api/tools?source=bazaar");
 *
 * // Search
 * const response = await fetch("/api/tools?search=weather");
 * ```
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const workspaceIdParam = searchParams.get("workspaceId");
    const source = searchParams.get("source") as "bazaar" | "manual" | null;
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);

    // Get workspace
    let workspaceId: ObjectId;
    if (workspaceIdParam && ObjectId.isValid(workspaceIdParam)) {
      workspaceId = new ObjectId(workspaceIdParam);
      // Verify membership
      const membership = await verifyMembership(userId, workspaceId);
      if (!membership) {
        return NextResponse.json(
          { success: false, error: "Forbidden: Not a member of this workspace" },
          { status: 403 }
        );
      }
    } else {
      // Get default workspace
      const workspace = await getWorkspaceForUser(userId);
      if (!workspace) {
        return NextResponse.json(
          { success: false, error: "No workspace found" },
          { status: 404 }
        );
      }
      workspaceId = workspace._id;
    }

    // Build filters
    const filters: {
      source?: "bazaar" | "manual";
      search?: string;
    } = {};

    if (source === "bazaar" || source === "manual") {
      filters.source = source;
    }
    if (search) {
      filters.search = search;
    }

    // Fetch tools
    const result = await listWorkspaceTools(workspaceId, filters, { page, pageSize });

    // Get counts by source
    const counts = await countToolsBySource(workspaceId);

    return NextResponse.json({
      success: true,
      tools: result.tools.map((tool) => ({
        id: tool._id.toString(),
        name: tool.name,
        description: tool.description,
        baseUrl: tool.baseUrl,
        source: tool.source,
        endpoints: tool.endpoints,
        reputation: tool.reputation,
        pricingHints: tool.pricingHints,
        createdAt: tool.createdAt.toISOString(),
        updatedAt: tool.updatedAt.toISOString(),
      })),
      pagination: {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        hasMore: result.hasMore,
      },
      counts,
    });
  } catch (error) {
    console.error("[Tools API] GET error:", error);
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
// POST /api/tools - Create a tool or sync from Bazaar
// =============================================================================

/**
 * POST /api/tools
 *
 * @description Creates a new manual tool or syncs tools from the x402 Bazaar.
 *
 * Request Body:
 * - action: "create" (create manual tool) or "sync" (sync from Bazaar)
 * - workspaceId (optional): Target workspace ID
 *
 * For action="create":
 * - name: Tool name
 * - description: Tool description
 * - baseUrl: Tool base URL
 * - endpoints: Array of endpoint definitions
 *
 * For action="sync":
 * - network (optional): Filter Bazaar by network (e.g., "eip155:84532")
 * - category (optional): Filter by category
 * - maxPriceAtomic (optional): Filter by max price
 *
 * @param req - The incoming Next.js request object.
 * @returns JSON response with created tool(s) or sync results.
 *
 * @example
 * ```typescript
 * // Create manual tool
 * await fetch("/api/tools", {
 *   method: "POST",
 *   body: JSON.stringify({
 *     action: "create",
 *     name: "My API",
 *     description: "Custom API",
 *     baseUrl: "https://api.example.com",
 *     endpoints: [{ path: "/data", method: "GET" }],
 *   }),
 * });
 *
 * // Sync from Bazaar
 * await fetch("/api/tools", {
 *   method: "POST",
 *   body: JSON.stringify({
 *     action: "sync",
 *     network: "eip155:84532",
 *   }),
 * });
 * ```
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { action = "create", workspaceId: workspaceIdParam } = body;

    // Get workspace
    let workspaceId: ObjectId;
    if (workspaceIdParam && ObjectId.isValid(workspaceIdParam)) {
      workspaceId = new ObjectId(workspaceIdParam);
      // Verify membership with write access
      const membership = await verifyMembership(userId, workspaceId);
      if (!membership || membership.role === "viewer") {
        return NextResponse.json(
          { success: false, error: "Forbidden: Insufficient permissions" },
          { status: 403 }
        );
      }
    } else {
      // Get default workspace
      const workspace = await getWorkspaceForUser(userId);
      if (!workspace) {
        return NextResponse.json(
          { success: false, error: "No workspace found" },
          { status: 404 }
        );
      }
      workspaceId = workspace._id;
    }

    // Handle different actions
    if (action === "sync") {
      return handleBazaarSync(workspaceId, body);
    } else if (action === "create") {
      return handleCreateTool(workspaceId, body);
    } else {
      return NextResponse.json(
        { success: false, error: `Invalid action: ${action}` },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("[Tools API] POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle syncing tools from the x402 Bazaar.
 *
 * @param workspaceId - The workspace to sync tools into.
 * @param body - Request body with sync options.
 * @returns JSON response with sync results.
 */
async function handleBazaarSync(
  workspaceId: ObjectId,
  body: {
    network?: string;
    category?: string;
    tags?: string[];
    maxPriceAtomic?: string;
    query?: string;
  }
): Promise<NextResponse> {
  const { network, category, tags, maxPriceAtomic, query } = body;

  console.log(`[Tools API] Starting Bazaar sync for workspace ${workspaceId}`);

  try {
    // Fetch tools from Bazaar
    const bazaarTools = await fetchBazaarAsTools({
      network,
      category,
      tags,
      maxPriceAtomic,
      query,
    });

    if (bazaarTools.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No tools found in Bazaar matching criteria",
        synced: 0,
        created: 0,
        updated: 0,
      });
    }

    // Upsert each tool
    let created = 0;
    let updated = 0;

    for (const toolData of bazaarTools) {
      try {
        const result = await upsertToolByBaseUrl(workspaceId, toolData);
        if (result.created) {
          created++;
        } else {
          updated++;
        }
      } catch (error) {
        console.error(`[Tools API] Failed to upsert tool ${toolData.baseUrl}:`, error);
      }
    }

    console.log(`[Tools API] Bazaar sync complete: ${created} created, ${updated} updated`);

    return NextResponse.json({
      success: true,
      message: `Synced ${bazaarTools.length} tools from Bazaar`,
      synced: bazaarTools.length,
      created,
      updated,
    });
  } catch (error) {
    console.error("[Tools API] Bazaar sync error:", error);

    // Return partial success info if available
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Bazaar sync failed",
        details: "The Bazaar API may be unavailable or returned an error",
      },
      { status: 502 }
    );
  }
}

/**
 * Handle creating a manual tool.
 *
 * @param workspaceId - The workspace to create the tool in.
 * @param body - Request body with tool data.
 * @returns JSON response with created tool.
 */
async function handleCreateTool(
  workspaceId: ObjectId,
  body: unknown
): Promise<NextResponse> {
  // Validate input - must be an object
  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  const parseResult = CreateToolSchema.safeParse({
    ...(body as Record<string, unknown>),
    source: "manual", // Force source to manual for user-created tools
  });

  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid tool data",
        details: parseResult.error.flatten(),
      },
      { status: 400 }
    );
  }

  const input = parseResult.data;

  // Check for duplicate base URL
  const { tools } = await listWorkspaceTools(workspaceId, {
    baseUrlPrefix: input.baseUrl,
  });

  if (tools.some((t) => t.baseUrl === input.baseUrl)) {
    return NextResponse.json(
      {
        success: false,
        error: "A tool with this base URL already exists",
      },
      { status: 409 }
    );
  }

  // Create the tool - convert nullable lastVerifiedAt to undefined
  const reputation = input.reputation
    ? {
        ...input.reputation,
        lastVerifiedAt: input.reputation.lastVerifiedAt ?? undefined,
      }
    : undefined;

  const tool = await createTool(workspaceId, {
    source: "manual",
    name: input.name,
    description: input.description,
    baseUrl: input.baseUrl,
    endpoints: input.endpoints,
    reputation,
    pricingHints: input.pricingHints,
  });

  return NextResponse.json({
    success: true,
    tool: {
      id: tool._id.toString(),
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
}
