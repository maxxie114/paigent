/**
 * x402 Bazaar Client
 *
 * @description Client for discovering x402-compatible services from the Coinbase
 * x402 Bazaar discovery layer. The Bazaar is a machine-readable catalog that helps
 * developers and AI agents find and integrate with payable API endpoints.
 *
 * @see https://docs.cdp.coinbase.com/x402/bazaar
 * @see https://docs.cdp.coinbase.com/x402/quickstart-for-buyers (Section 4)
 */

import { z } from "zod";

// =============================================================================
// Bazaar API Constants
// =============================================================================

/**
 * Coinbase CDP Bazaar Discovery API endpoint.
 *
 * @see https://docs.cdp.coinbase.com/x402/quickstart-for-buyers
 */
const BAZAAR_API_URL =
  "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources";

/**
 * Default pagination limit for Bazaar queries.
 */
const DEFAULT_LIMIT = 100;

// =============================================================================
// Bazaar Response Types
// =============================================================================
//
// These schemas match the CDP Bazaar Discovery API response format.
// @see https://docs.cdp.coinbase.com/x402/bazaar.md
//
// Note: Pricing information is NOT included in discovery responses.
// Pricing is determined at request time via 402 Payment Required headers.
// =============================================================================

/**
 * Metadata for a Bazaar resource.
 *
 * @description Contains input/output schema information and descriptions
 * for the discovered endpoint.
 *
 * @see https://docs.cdp.coinbase.com/x402/bazaar.md
 */
export const BazaarResourceMetadataSchema = z.object({
  /** Human-readable description of the endpoint. */
  description: z.string().optional(),
  /** Input specification (query params or body). */
  input: z.record(z.unknown()).optional(),
  /** Output specification with example and schema. */
  output: z.record(z.unknown()).optional(),
}).passthrough(); // Allow additional fields we may not know about

export type BazaarResourceMetadata = z.infer<typeof BazaarResourceMetadataSchema>;

/**
 * A single resource/endpoint from the Bazaar.
 *
 * @description Matches the actual CDP Bazaar Discovery API response format.
 * The API returns resources with url, type, and optional metadata.
 *
 * @see https://docs.cdp.coinbase.com/x402/bazaar.md
 */
export const BazaarResourceSchema = z.object({
  /** Full URL of the endpoint (including path). */
  url: z.string(),
  /** Protocol type (e.g., "http"). */
  type: z.string().optional(),
  /** Metadata about the endpoint including input/output schemas. */
  metadata: BazaarResourceMetadataSchema.optional(),
}).passthrough(); // Allow additional fields for forward compatibility

export type BazaarResource = z.infer<typeof BazaarResourceSchema>;

/**
 * Paginated response from the Bazaar discovery API.
 *
 * @description Matches the CDP Bazaar Discovery API response schema.
 * Note: The API uses "resources" (not "items") for the array field.
 *
 * @see https://docs.cdp.coinbase.com/x402/bazaar.md
 */
export const BazaarListResponseSchema = z.object({
  /** List of discovered resources. */
  resources: z.array(BazaarResourceSchema),
  /** Total number of resources available. */
  total: z.number().optional(),
  /** Number of results returned (matches limit param). */
  limit: z.number().optional(),
  /** Offset for pagination. */
  offset: z.number().optional(),
});

export type BazaarListResponse = z.infer<typeof BazaarListResponseSchema>;

// =============================================================================
// Bazaar Query Options
// =============================================================================

/**
 * Options for querying the Bazaar.
 */
export type BazaarQueryOptions = {
  /** Maximum number of results to return. */
  limit?: number;
  /** Pagination cursor from previous response. */
  cursor?: string;
  /** Filter by category. */
  category?: string;
  /** Filter by tags (comma-separated). */
  tags?: string[];
  /** Filter by network (CAIP-2 format). */
  network?: string;
  /** Maximum price in atomic units. */
  maxPriceAtomic?: string;
  /** Search query for description matching. */
  query?: string;
};

// =============================================================================
// Bazaar Client Functions
// =============================================================================

/**
 * Fetch available x402 services from the Coinbase Bazaar.
 *
 * @description Queries the x402 Bazaar discovery API to retrieve a list of
 * available paid API services. This enables dynamic service discovery for
 * autonomous agents without hardcoded endpoint lists.
 *
 * @param options - Query options for filtering and pagination.
 * @returns Paginated list of Bazaar resources.
 *
 * @throws {Error} If the Bazaar API request fails.
 * @throws {Error} If the response fails validation.
 *
 * @example
 * ```typescript
 * // Fetch all available services
 * const { resources } = await fetchBazaarServices();
 * console.log(`Found ${resources.length} services`);
 *
 * // Filter by network
 * const baseSepoliaServices = await fetchBazaarServices({
 *   network: "eip155:84532", // Base Sepolia
 * });
 *
 * // Search with pagination
 * const page1 = await fetchBazaarServices({ limit: 20 });
 * const page2 = await fetchBazaarServices({ limit: 20, cursor: "20" });
 * ```
 *
 * @see https://docs.cdp.coinbase.com/x402/bazaar
 */
export async function fetchBazaarServices(
  options: BazaarQueryOptions = {}
): Promise<BazaarListResponse> {
  const { limit = DEFAULT_LIMIT, cursor, category, tags, network, maxPriceAtomic, query } = options;

  // Build query parameters
  const params = new URLSearchParams();
  params.set("limit", limit.toString());

  if (cursor) {
    params.set("cursor", cursor);
  }
  if (category) {
    params.set("category", category);
  }
  if (tags && tags.length > 0) {
    params.set("tags", tags.join(","));
  }
  if (network) {
    params.set("network", network);
  }
  if (maxPriceAtomic) {
    params.set("maxPrice", maxPriceAtomic);
  }
  if (query) {
    params.set("q", query);
  }

  const url = `${BAZAAR_API_URL}?${params.toString()}`;

  console.log(`[Bazaar] Fetching services from: ${url}`);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Paigent-Studio/1.0",
      },
      // No authentication required for public discovery endpoint
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bazaar API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Validate response shape
    const validated = BazaarListResponseSchema.parse(data);

    console.log(`[Bazaar] Found ${validated.resources.length} services`);

    return validated;
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      console.error("[Bazaar] Response validation failed:", error.errors);
      throw new Error(`Bazaar response validation failed: ${error.message}`);
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Group Bazaar resources by base URL to create tool entries.
 *
 * @description The Bazaar returns individual endpoints, but our tool model
 * groups endpoints under a single base URL. This function aggregates
 * endpoints by their base URL.
 *
 * @param resources - List of Bazaar resources.
 * @returns Map of base URL to grouped endpoints.
 *
 * @example
 * ```typescript
 * const { resources } = await fetchBazaarServices();
 * const grouped = groupResourcesByBaseUrl(resources);
 *
 * for (const [baseUrl, endpoints] of grouped) {
 *   console.log(`Tool: ${baseUrl}`);
 *   console.log(`  Endpoints: ${endpoints.length}`);
 * }
 * ```
 */
export function groupResourcesByBaseUrl(
  resources: BazaarResource[]
): Map<string, BazaarResource[]> {
  const grouped = new Map<string, BazaarResource[]>();

  for (const resource of resources) {
    try {
      const url = new URL(resource.url);
      const baseUrl = `${url.protocol}//${url.host}`;

      const existing = grouped.get(baseUrl) || [];
      existing.push(resource);
      grouped.set(baseUrl, existing);
    } catch {
      // Skip malformed URLs
      console.warn(`[Bazaar] Skipping malformed URL: ${resource.url}`);
    }
  }

  return grouped;
}

/**
 * Convert a grouped set of Bazaar resources into a tool-compatible format.
 *
 * @description Transforms Bazaar resources into the format expected by our
 * tools collection, including endpoints, pricing hints, and reputation.
 * Handles the CDP Bazaar API response format where metadata is nested.
 *
 * @param baseUrl - The base URL for the tool.
 * @param resources - List of endpoints under this base URL.
 * @returns Tool-compatible object.
 *
 * @see https://docs.cdp.coinbase.com/x402/bazaar.md
 */
export function convertToToolFormat(
  baseUrl: string,
  resources: BazaarResource[]
): {
  source: "bazaar";
  name: string;
  description: string;
  baseUrl: string;
  endpoints: Array<{
    path: string;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    description?: string;
    requestSchema?: Record<string, unknown>;
    responseSchema?: Record<string, unknown>;
  }>;
  reputation: {
    successRate: number;
    avgLatencyMs: number;
    disputeRate: number;
    lastVerifiedAt: Date | undefined;
  };
  pricingHints?: {
    typicalAmountAtomic?: string;
    network?: string;
    asset?: string;
  };
} {
  // Derive name from hostname
  let name: string;
  try {
    const url = new URL(baseUrl);
    name = url.hostname.split(".")[0] || "Unknown Service";
  } catch {
    name = "Unknown Service";
  }

  // Aggregate descriptions from metadata
  const descriptions = resources
    .filter((r) => r.metadata?.description)
    .map((r) => r.metadata!.description!)
    .slice(0, 3);
  const description =
    descriptions.length > 0
      ? descriptions.join(". ")
      : `x402-compatible service at ${baseUrl}`;

  // Convert endpoints - extract info from URL and metadata
  const endpoints = resources.map((r) => {
    let path: string;
    try {
      const url = new URL(r.url);
      path = url.pathname || "/";
    } catch {
      path = "/";
    }

    // Try to determine method from metadata.input if available
    // The input field may contain HTTP method info like { type: "http", method: "GET", ... }
    let method = "GET";
    const inputInfo = r.metadata?.input as Record<string, unknown> | undefined;
    if (inputInfo?.method && typeof inputInfo.method === "string") {
      method = inputInfo.method.toUpperCase();
    }

    // Extract schemas from metadata
    const inputSchema = inputInfo as Record<string, unknown> | undefined;
    const outputSchema = r.metadata?.output as Record<string, unknown> | undefined;

    return {
      path,
      method: method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
      description: r.metadata?.description,
      requestSchema: inputSchema,
      responseSchema: outputSchema,
    };
  });

  // Deduplicate endpoints by path+method
  const uniqueEndpoints = endpoints.filter(
    (ep, idx, arr) =>
      arr.findIndex((e) => e.path === ep.path && e.method === ep.method) === idx
  );

  // Default reputation - the Bazaar API doesn't provide quality scores in current response
  // We default to reasonable values; actual metrics would need to be tracked over time
  return {
    source: "bazaar" as const,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    description,
    baseUrl,
    endpoints: uniqueEndpoints,
    reputation: {
      successRate: 0.8, // Default optimistic value
      avgLatencyMs: 500, // Default estimate
      disputeRate: 0,
      lastVerifiedAt: undefined,
    },
    // Note: The CDP Bazaar API currently doesn't include pricing in discovery response
    // Pricing is determined at request time via 402 response headers
    pricingHints: undefined,
  };
}

/**
 * Fetch and transform Bazaar services into tool format.
 *
 * @description High-level function that fetches from Bazaar, groups by base URL,
 * and converts to our tool format. This is the main entry point for syncing
 * Bazaar services into the tools collection.
 *
 * @param options - Query options for filtering services.
 * @returns Array of tools in our database format.
 *
 * @example
 * ```typescript
 * // Sync all Base Sepolia services
 * const tools = await fetchBazaarAsTools({
 *   network: "eip155:84532",
 * });
 *
 * // Store in database
 * for (const tool of tools) {
 *   await upsertTool(workspaceId, tool);
 * }
 * ```
 */
export async function fetchBazaarAsTools(
  options: BazaarQueryOptions = {}
): Promise<
  Array<ReturnType<typeof convertToToolFormat>>
> {
  const { resources } = await fetchBazaarServices(options);

  if (resources.length === 0) {
    console.log("[Bazaar] No services found");
    return [];
  }

  const grouped = groupResourcesByBaseUrl(resources);
  const tools: Array<ReturnType<typeof convertToToolFormat>> = [];

  for (const [baseUrl, groupedResources] of grouped) {
    const tool = convertToToolFormat(baseUrl, groupedResources);
    tools.push(tool);
  }

  console.log(`[Bazaar] Converted ${tools.length} tools from ${resources.length} endpoints`);

  return tools;
}

/**
 * Filter Bazaar tools by budget constraints.
 *
 * @description Filters a list of tools to only include those whose typical
 * price is within the specified budget.
 *
 * @param tools - List of tools from Bazaar.
 * @param maxAmountAtomic - Maximum allowed payment in atomic units.
 * @returns Filtered list of affordable tools.
 */
export function filterByBudget<T extends { pricingHints?: { typicalAmountAtomic?: string } }>(
  tools: T[],
  maxAmountAtomic: string
): T[] {
  const maxBudget = BigInt(maxAmountAtomic);

  return tools.filter((tool) => {
    const price = tool.pricingHints?.typicalAmountAtomic;
    if (!price) {
      // No price means potentially free or unknown - include it
      return true;
    }

    try {
      return BigInt(price) <= maxBudget;
    } catch {
      return true; // Include if price can't be parsed
    }
  });
}
