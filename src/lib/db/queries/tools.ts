/**
 * Tool Database Queries
 *
 * @description CRUD operations for the tools collection. Supports both
 * manual tool registration and Bazaar-sourced tool synchronization.
 *
 * @see paigent-studio-spec.md Section 7.2.3
 */

import { ObjectId, Filter, UpdateFilter } from "mongodb";
import { getDb } from "../client";
import type {
  ToolDocument,
  ToolSource,
  ToolEndpoint,
  ToolReputation,
  ToolPricingHints,
} from "../collections";

// =============================================================================
// Types
// =============================================================================

/**
 * Input for creating a new tool.
 */
export type CreateToolInput = {
  /** Tool source (bazaar or manual). */
  source: ToolSource;
  /** Human-readable name. */
  name: string;
  /** Description of what the tool does. */
  description: string;
  /** Base URL for the tool API. */
  baseUrl: string;
  /** Available endpoints. */
  endpoints: ToolEndpoint[];
  /** Reputation metrics (optional, defaults provided). */
  reputation?: Partial<ToolReputation>;
  /** Pricing hints from 402 responses. */
  pricingHints?: ToolPricingHints;
};

/**
 * Input for updating an existing tool.
 */
export type UpdateToolInput = {
  /** Updated name. */
  name?: string;
  /** Updated description. */
  description?: string;
  /** Updated endpoints. */
  endpoints?: ToolEndpoint[];
  /** Updated reputation metrics. */
  reputation?: Partial<ToolReputation>;
  /** Updated pricing hints. */
  pricingHints?: ToolPricingHints;
};

/**
 * Query filters for listing tools.
 */
export type ToolQueryFilters = {
  /** Filter by source. */
  source?: ToolSource;
  /** Search by name or description. */
  search?: string;
  /** Filter by base URL prefix. */
  baseUrlPrefix?: string;
};

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Get the tools collection.
 *
 * @returns MongoDB collection for tools.
 */
async function getToolsCollection() {
  const db = await getDb();
  return db.collection<ToolDocument>("tools");
}

/**
 * Create a new tool in the database.
 *
 * @description Creates a tool document for a workspace. For Bazaar-sourced
 * tools, this is called during sync. For manual tools, this is called from
 * the API when users add their own tools.
 *
 * @param workspaceId - The workspace to create the tool in.
 * @param input - Tool creation input.
 * @returns The created tool document.
 *
 * @example
 * ```typescript
 * const tool = await createTool(workspaceId, {
 *   source: "manual",
 *   name: "My API",
 *   description: "Custom API integration",
 *   baseUrl: "https://api.example.com",
 *   endpoints: [{ path: "/data", method: "GET" }],
 * });
 * ```
 */
export async function createTool(
  workspaceId: ObjectId,
  input: CreateToolInput
): Promise<ToolDocument> {
  const collection = await getToolsCollection();

  const now = new Date();

  const doc: Omit<ToolDocument, "_id"> = {
    workspaceId,
    source: input.source,
    name: input.name,
    description: input.description,
    baseUrl: input.baseUrl,
    endpoints: input.endpoints,
    reputation: {
      successRate: input.reputation?.successRate ?? 0.8,
      avgLatencyMs: input.reputation?.avgLatencyMs ?? 500,
      disputeRate: input.reputation?.disputeRate ?? 0,
      lastVerifiedAt: input.reputation?.lastVerifiedAt ?? undefined,
    },
    pricingHints: input.pricingHints,
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(doc as ToolDocument);

  return {
    _id: result.insertedId,
    ...doc,
  } as ToolDocument;
}

/**
 * Get a tool by ID.
 *
 * @param toolId - The tool's ObjectId.
 * @returns The tool document or null if not found.
 */
export async function getToolById(toolId: ObjectId): Promise<ToolDocument | null> {
  const collection = await getToolsCollection();
  return collection.findOne({ _id: toolId });
}

/**
 * Get a tool by ID within a specific workspace.
 *
 * @description Ensures the tool belongs to the workspace for authorization.
 *
 * @param workspaceId - The workspace ID.
 * @param toolId - The tool ID.
 * @returns The tool document or null if not found/not in workspace.
 */
export async function getWorkspaceTool(
  workspaceId: ObjectId,
  toolId: ObjectId
): Promise<ToolDocument | null> {
  const collection = await getToolsCollection();
  return collection.findOne({ _id: toolId, workspaceId });
}

/**
 * Get a tool by base URL within a workspace.
 *
 * @description Used to check for duplicates when syncing from Bazaar.
 *
 * @param workspaceId - The workspace ID.
 * @param baseUrl - The tool's base URL.
 * @returns The tool document or null if not found.
 */
export async function getToolByBaseUrl(
  workspaceId: ObjectId,
  baseUrl: string
): Promise<ToolDocument | null> {
  const collection = await getToolsCollection();
  return collection.findOne({ workspaceId, baseUrl });
}

/**
 * List tools for a workspace with optional filters.
 *
 * @description Returns a paginated list of tools with filtering and search.
 *
 * @param workspaceId - The workspace ID.
 * @param filters - Optional query filters.
 * @param options - Pagination options.
 * @returns Paginated list of tools.
 *
 * @example
 * ```typescript
 * // List all Bazaar tools
 * const { tools, total } = await listWorkspaceTools(workspaceId, {
 *   source: "bazaar",
 * });
 *
 * // Search for tools
 * const { tools } = await listWorkspaceTools(workspaceId, {
 *   search: "weather",
 * });
 * ```
 */
export async function listWorkspaceTools(
  workspaceId: ObjectId,
  filters: ToolQueryFilters = {},
  options: { page?: number; pageSize?: number } = {}
): Promise<{
  tools: ToolDocument[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}> {
  const collection = await getToolsCollection();

  const { page = 1, pageSize = 50 } = options;
  const skip = (page - 1) * pageSize;

  // Build filter query
  const query: Filter<ToolDocument> = { workspaceId };

  if (filters.source) {
    query.source = filters.source;
  }

  if (filters.baseUrlPrefix) {
    query.baseUrl = { $regex: `^${filters.baseUrlPrefix}` };
  }

  if (filters.search) {
    // Text search on name and description
    query.$or = [
      { name: { $regex: filters.search, $options: "i" } },
      { description: { $regex: filters.search, $options: "i" } },
    ];
  }

  // Execute query with pagination
  const [tools, total] = await Promise.all([
    collection.find(query).sort({ updatedAt: -1 }).skip(skip).limit(pageSize).toArray(),
    collection.countDocuments(query),
  ]);

  return {
    tools,
    total,
    page,
    pageSize,
    hasMore: skip + tools.length < total,
  };
}

/**
 * Update a tool.
 *
 * @param toolId - The tool ID to update.
 * @param input - Fields to update.
 * @returns The updated tool document or null if not found.
 */
export async function updateTool(
  toolId: ObjectId,
  input: UpdateToolInput
): Promise<ToolDocument | null> {
  const collection = await getToolsCollection();

  // Build $set object dynamically
  const setFields: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    setFields.name = input.name;
  }
  if (input.description !== undefined) {
    setFields.description = input.description;
  }
  if (input.endpoints !== undefined) {
    setFields.endpoints = input.endpoints;
  }
  if (input.pricingHints !== undefined) {
    setFields.pricingHints = input.pricingHints;
  }
  if (input.reputation !== undefined) {
    // Merge with existing reputation
    Object.entries(input.reputation).forEach(([key, value]) => {
      if (value !== undefined) {
        setFields[`reputation.${key}`] = value;
      }
    });
  }

  return collection.findOneAndUpdate(
    { _id: toolId },
    { $set: setFields } as UpdateFilter<ToolDocument>,
    { returnDocument: "after" }
  );
}

/**
 * Upsert a tool by base URL (for Bazaar sync).
 *
 * @description Creates or updates a tool based on its base URL. Used during
 * Bazaar synchronization to avoid duplicates.
 *
 * @param workspaceId - The workspace ID.
 * @param input - Tool data.
 * @returns The upserted tool document and whether it was created.
 *
 * @example
 * ```typescript
 * const { tool, created } = await upsertToolByBaseUrl(workspaceId, {
 *   source: "bazaar",
 *   name: "Weather API",
 *   baseUrl: "https://weather.example.com",
 *   // ...
 * });
 *
 * if (created) {
 *   console.log("New tool discovered!");
 * } else {
 *   console.log("Tool updated");
 * }
 * ```
 */
export async function upsertToolByBaseUrl(
  workspaceId: ObjectId,
  input: CreateToolInput
): Promise<{ tool: ToolDocument; created: boolean }> {
  const collection = await getToolsCollection();

  const now = new Date();

  const result = await collection.findOneAndUpdate(
    { workspaceId, baseUrl: input.baseUrl },
    {
      $set: {
        name: input.name,
        description: input.description,
        endpoints: input.endpoints,
        reputation: {
          successRate: input.reputation?.successRate ?? 0.8,
          avgLatencyMs: input.reputation?.avgLatencyMs ?? 500,
          disputeRate: input.reputation?.disputeRate ?? 0,
          lastVerifiedAt: input.reputation?.lastVerifiedAt ?? undefined,
        },
        pricingHints: input.pricingHints,
        updatedAt: now,
      },
      $setOnInsert: {
        workspaceId,
        source: input.source,
        baseUrl: input.baseUrl,
        createdAt: now,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
    }
  );

  // Check if it was an insert by comparing createdAt with updatedAt
  const tool = result!;
  const created = tool.createdAt.getTime() === tool.updatedAt.getTime();

  return { tool, created };
}

/**
 * Delete a tool.
 *
 * @param toolId - The tool ID to delete.
 * @returns True if the tool was deleted.
 */
export async function deleteTool(toolId: ObjectId): Promise<boolean> {
  const collection = await getToolsCollection();
  const result = await collection.deleteOne({ _id: toolId });
  return result.deletedCount > 0;
}

/**
 * Delete a tool within a specific workspace.
 *
 * @description Ensures the tool belongs to the workspace before deletion.
 *
 * @param workspaceId - The workspace ID.
 * @param toolId - The tool ID.
 * @returns True if the tool was deleted.
 */
export async function deleteWorkspaceTool(
  workspaceId: ObjectId,
  toolId: ObjectId
): Promise<boolean> {
  const collection = await getToolsCollection();
  const result = await collection.deleteOne({ _id: toolId, workspaceId });
  return result.deletedCount > 0;
}

/**
 * Delete all Bazaar-sourced tools for a workspace.
 *
 * @description Used before a full Bazaar resync to clean up stale tools.
 *
 * @param workspaceId - The workspace ID.
 * @returns Number of tools deleted.
 */
export async function deleteBazaarTools(workspaceId: ObjectId): Promise<number> {
  const collection = await getToolsCollection();
  const result = await collection.deleteMany({ workspaceId, source: "bazaar" });
  return result.deletedCount;
}

/**
 * Update tool reputation after a successful/failed call.
 *
 * @description Updates the rolling success rate and latency metrics.
 *
 * @param toolId - The tool ID.
 * @param succeeded - Whether the call succeeded.
 * @param latencyMs - The call latency in milliseconds.
 *
 * @example
 * ```typescript
 * // After a successful call
 * await updateToolReputation(toolId, true, 250);
 *
 * // After a failed call
 * await updateToolReputation(toolId, false, 5000);
 * ```
 */
export async function updateToolReputation(
  toolId: ObjectId,
  succeeded: boolean,
  latencyMs: number
): Promise<void> {
  const collection = await getToolsCollection();

  const tool = await collection.findOne({ _id: toolId });
  if (!tool) {
    return;
  }

  // Simple rolling average (weight recent calls more)
  const alpha = 0.1; // Learning rate
  const newSuccessRate =
    tool.reputation.successRate * (1 - alpha) + (succeeded ? 1 : 0) * alpha;
  const newLatency =
    tool.reputation.avgLatencyMs * (1 - alpha) + latencyMs * alpha;

  await collection.updateOne(
    { _id: toolId },
    {
      $set: {
        "reputation.successRate": newSuccessRate,
        "reputation.avgLatencyMs": newLatency,
        "reputation.lastVerifiedAt": new Date(),
        updatedAt: new Date(),
      },
    }
  );
}

/**
 * Update tool pricing hints from a 402 response.
 *
 * @description Stores the latest pricing information observed from a
 * PAYMENT-REQUIRED response.
 *
 * @param toolId - The tool ID.
 * @param pricingHints - New pricing information.
 */
export async function updateToolPricing(
  toolId: ObjectId,
  pricingHints: ToolPricingHints
): Promise<void> {
  const collection = await getToolsCollection();

  await collection.updateOne(
    { _id: toolId },
    {
      $set: {
        pricingHints,
        updatedAt: new Date(),
      },
    }
  );
}

/**
 * Get tools that match an allowlist of base URLs.
 *
 * @description Filters tools to only those whose base URL is in the
 * workspace's tool allowlist.
 *
 * @param workspaceId - The workspace ID.
 * @param allowlist - List of allowed base URLs.
 * @returns Tools matching the allowlist.
 */
export async function getToolsInAllowlist(
  workspaceId: ObjectId,
  allowlist: string[]
): Promise<ToolDocument[]> {
  if (allowlist.length === 0) {
    return [];
  }

  const collection = await getToolsCollection();

  return collection
    .find({
      workspaceId,
      baseUrl: { $in: allowlist },
    })
    .toArray();
}

/**
 * Count tools by source for a workspace.
 *
 * @param workspaceId - The workspace ID.
 * @returns Count of tools by source type.
 */
export async function countToolsBySource(
  workspaceId: ObjectId
): Promise<{ bazaar: number; manual: number; total: number }> {
  const collection = await getToolsCollection();

  const [bazaar, manual] = await Promise.all([
    collection.countDocuments({ workspaceId, source: "bazaar" }),
    collection.countDocuments({ workspaceId, source: "manual" }),
  ]);

  return {
    bazaar,
    manual,
    total: bazaar + manual,
  };
}
