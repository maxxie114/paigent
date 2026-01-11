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
 * Payment acceptance configuration for a Bazaar resource.
 *
 * @description Defines the payment requirements for accessing an endpoint.
 * Each resource may accept payments in multiple ways.
 *
 * @see https://docs.cdp.coinbase.com/x402/quickstart-for-buyers
 */
export const BazaarPaymentAcceptSchema = z.object({
  /** Payment scheme (e.g., "exact"). */
  scheme: z.string().optional(),
  /** Payment amount as a string (e.g., "$0.001" or atomic units). */
  amount: z.string().optional(),
  /** Price as a string (alternative to amount). */
  price: z.string().optional(),
  /** Network identifier in CAIP-2 format (e.g., "eip155:8453"). */
  network: z.string().optional(),
  /** Address to pay to. */
  payTo: z.string().optional(),
}).passthrough();

export type BazaarPaymentAccept = z.infer<typeof BazaarPaymentAcceptSchema>;

/**
 * A single item/endpoint from the Bazaar discovery API.
 *
 * @description Matches the actual CDP Bazaar Discovery API response format.
 * The API returns items with url, accepts array, and optional metadata.
 *
 * @see https://docs.cdp.coinbase.com/x402/quickstart-for-buyers
 */
export const BazaarItemSchema = z.object({
  /** Full URL of the endpoint (including path). */
  url: z.string(),
  /** Protocol type (e.g., "http"). */
  type: z.string().optional(),
  /** Payment acceptance configurations. */
  accepts: z.array(BazaarPaymentAcceptSchema).optional(),
  /** Human-readable description of the endpoint. */
  description: z.string().optional(),
  /** MIME type of the response. */
  mimeType: z.string().optional(),
  /** Metadata about the endpoint including input/output schemas. */
  metadata: BazaarResourceMetadataSchema.optional(),
}).passthrough(); // Allow additional fields for forward compatibility

export type BazaarItem = z.infer<typeof BazaarItemSchema>;

/**
 * Raw paginated response from the Bazaar discovery API.
 *
 * @description The CDP Bazaar API has inconsistent documentation:
 * - API Reference (https://docs.cdp.coinbase.com/x402/bazaar#api-reference) shows `resources`
 * - Quickstart examples (https://docs.cdp.coinbase.com/x402/quickstart-for-buyers) show `items`
 *
 * This schema accepts both formats for maximum compatibility.
 *
 * @see https://docs.cdp.coinbase.com/x402/bazaar#api-reference
 */
const BazaarRawResponseSchema = z.object({
  /** List of discovered resources (API Reference format). */
  resources: z.array(BazaarItemSchema).optional(),
  /** List of discovered items (Quickstart format). */
  items: z.array(BazaarItemSchema).optional(),
  /** Total number of items available. */
  total: z.number().optional(),
  /** Number of results returned (matches limit param). */
  limit: z.number().optional(),
  /** Offset for pagination. */
  offset: z.number().optional(),
  /** Cursor for next page. */
  cursor: z.string().optional(),
  /** Indicates if there are more results. */
  hasMore: z.boolean().optional(),
}).passthrough(); // Allow additional fields for forward compatibility

/**
 * Normalized paginated response from the Bazaar discovery API.
 *
 * @description This type represents the normalized response where the array
 * of services is always available as `resources` (matching the official
 * API Reference documentation).
 *
 * @see https://docs.cdp.coinbase.com/x402/bazaar#api-reference
 */
export type BazaarListResponse = {
  /** List of discovered resources/services. */
  resources: BazaarItem[];
  /** Total number of items available. */
  total?: number;
  /** Number of results returned (matches limit param). */
  limit?: number;
  /** Offset for pagination. */
  offset?: number;
  /** Cursor for next page. */
  cursor?: string;
  /** Indicates if there are more results. */
  hasMore?: boolean;
};

/**
 * Parse and normalize the Bazaar API response.
 *
 * @description Handles both `resources` (API Reference) and `items` (Quickstart)
 * response formats, normalizing to always use `resources` for consistency.
 *
 * @param data - Raw API response data.
 * @returns Normalized response with `resources` array.
 * @throws {z.ZodError} If the response doesn't match expected schema.
 * @throws {Error} If neither `resources` nor `items` array is present.
 */
function parseBazaarResponse(data: unknown): BazaarListResponse {
  const parsed = BazaarRawResponseSchema.parse(data);
  
  // Normalize: prefer `resources`, fall back to `items`
  const resources = parsed.resources ?? parsed.items;
  
  if (!resources) {
    throw new Error(
      "Bazaar API response missing both 'resources' and 'items' arrays. " +
      "Response keys: " + Object.keys(parsed as object).join(", ")
    );
  }
  
  return {
    resources,
    total: parsed.total,
    limit: parsed.limit,
    offset: parsed.offset,
    cursor: parsed.cursor,
    hasMore: parsed.hasMore,
  };
}

// =============================================================================
// Bazaar Query Options
// =============================================================================

/**
 * Options for querying the Bazaar discovery endpoint.
 *
 * @description Matches the query parameters documented in the CDP Bazaar API Reference.
 *
 * @see https://docs.cdp.coinbase.com/x402/bazaar#query-parameters
 */
export type BazaarQueryOptions = {
  /**
   * Filter by protocol type (e.g., "http").
   *
   * @example "http"
   */
  type?: string;
  /**
   * Maximum number of results to return.
   *
   * @default 20 (per API docs), but we use 100 for efficiency
   */
  limit?: number;
  /**
   * Offset for pagination.
   *
   * @default 0
   */
  offset?: number;
  /**
   * Filter by network (CAIP-2 format). May not be supported by all facilitators.
   *
   * @example "eip155:84532" // Base Sepolia
   */
  network?: string;
  /**
   * Search query for description matching. May not be supported by all facilitators.
   */
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
 * // Fetch all available HTTP services
 * const { resources } = await fetchBazaarServices({ type: "http" });
 * console.log(`Found ${resources.length} services`);
 *
 * // Filter by network
 * const baseSepoliaServices = await fetchBazaarServices({
 *   type: "http",
 *   network: "eip155:84532", // Base Sepolia
 * });
 *
 * // Paginate through results
 * const page1 = await fetchBazaarServices({ limit: 20, offset: 0 });
 * const page2 = await fetchBazaarServices({ limit: 20, offset: 20 });
 * ```
 *
 * @see https://docs.cdp.coinbase.com/x402/bazaar
 */
export async function fetchBazaarServices(
  options: BazaarQueryOptions = {}
): Promise<BazaarListResponse> {
  const { type, limit = DEFAULT_LIMIT, offset = 0, network, query } = options;

  // Build query parameters per official API Reference:
  // https://docs.cdp.coinbase.com/x402/bazaar#query-parameters
  const params = new URLSearchParams();
  
  // Core pagination parameters (officially documented)
  params.set("limit", limit.toString());
  params.set("offset", offset.toString());
  
  // Filter by protocol type (officially documented)
  if (type) {
    params.set("type", type);
  }
  
  // Additional filters (may not be supported by all facilitators)
  if (network) {
    params.set("network", network);
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

    // Log raw response keys for debugging
    console.log(`[Bazaar] Response keys: ${Object.keys(data as object).join(", ")}`);

    // Parse and normalize response (handles both `resources` and `items` formats)
    const validated = parseBazaarResponse(data);

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
 * Group Bazaar items by base URL to create tool entries.
 *
 * @description The Bazaar returns individual endpoints, but our tool model
 * groups endpoints under a single base URL. This function aggregates
 * endpoints by their base URL.
 *
 * @param items - List of Bazaar items.
 * @returns Map of base URL to grouped endpoints.
 *
 * @example
 * ```typescript
 * const { resources } = await fetchBazaarServices();
 * const grouped = groupItemsByBaseUrl(resources);
 *
 * for (const [baseUrl, endpoints] of grouped) {
 *   console.log(`Tool: ${baseUrl}`);
 *   console.log(`  Endpoints: ${endpoints.length}`);
 * }
 * ```
 */
export function groupItemsByBaseUrl(
  items: BazaarItem[]
): Map<string, BazaarItem[]> {
  const grouped = new Map<string, BazaarItem[]>();

  for (const item of items) {
    try {
      const url = new URL(item.url);
      const baseUrl = `${url.protocol}//${url.host}`;

      const existing = grouped.get(baseUrl) || [];
      existing.push(item);
      grouped.set(baseUrl, existing);
    } catch {
      // Skip malformed URLs
      console.warn(`[Bazaar] Skipping malformed URL: ${item.url}`);
    }
  }

  return grouped;
}

/**
 * Convert a grouped set of Bazaar items into a tool-compatible format.
 *
 * @description Transforms Bazaar items into the format expected by our
 * tools collection, including endpoints, pricing hints, and reputation.
 * Handles the CDP Bazaar API response format where accepts array contains pricing.
 *
 * @param baseUrl - The base URL for the tool.
 * @param items - List of endpoints under this base URL.
 * @returns Tool-compatible object.
 *
 * @see https://docs.cdp.coinbase.com/x402/quickstart-for-buyers
 */
export function convertToToolFormat(
  baseUrl: string,
  items: BazaarItem[]
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

  // Aggregate descriptions from items (description can be at item level or in metadata)
  const descriptions = items
    .filter((item) => item.description || item.metadata?.description)
    .map((item) => item.description || item.metadata!.description!)
    .slice(0, 3);
  const description =
    descriptions.length > 0
      ? descriptions.join(". ")
      : `x402-compatible service at ${baseUrl}`;

  // Convert endpoints - extract info from URL, description, and metadata
  const endpoints = items.map((item) => {
    let path: string;
    try {
      const url = new URL(item.url);
      path = url.pathname || "/";
    } catch {
      path = "/";
    }

    // Try to determine method from metadata.input if available
    // The input field may contain HTTP method info like { type: "http", method: "GET", ... }
    let method = "GET";
    const inputInfo = item.metadata?.input as Record<string, unknown> | undefined;
    if (inputInfo?.method && typeof inputInfo.method === "string") {
      method = inputInfo.method.toUpperCase();
    }

    // Extract schemas from metadata
    const inputSchema = inputInfo as Record<string, unknown> | undefined;
    const outputSchema = item.metadata?.output as Record<string, unknown> | undefined;

    return {
      path,
      method: method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
      description: item.description || item.metadata?.description,
      requestSchema: inputSchema,
      responseSchema: outputSchema,
    };
  });

  // Deduplicate endpoints by path+method
  const uniqueEndpoints = endpoints.filter(
    (ep, idx, arr) =>
      arr.findIndex((e) => e.path === ep.path && e.method === ep.method) === idx
  );

  // Extract pricing hints from the first item that has accepts array
  let pricingHints: { typicalAmountAtomic?: string; network?: string; asset?: string } | undefined;
  const itemWithPricing = items.find((item) => item.accepts && item.accepts.length > 0);
  if (itemWithPricing?.accepts?.[0]) {
    const acceptInfo = itemWithPricing.accepts[0];
    pricingHints = {
      // Amount could be in `amount` or `price` field
      typicalAmountAtomic: acceptInfo.amount || acceptInfo.price,
      network: acceptInfo.network,
      asset: undefined, // Asset info not directly provided in accepts
    };
  }

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
    pricingHints,
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

  const grouped = groupItemsByBaseUrl(resources);
  const tools: Array<ReturnType<typeof convertToToolFormat>> = [];

  for (const [baseUrl, groupedItems] of grouped) {
    const tool = convertToToolFormat(baseUrl, groupedItems);
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
