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

/**
 * Payment acceptance requirement from a Bazaar service.
 *
 * @description Defines how a service accepts payment, including the payment
 * scheme, price, network, and recipient address.
 */
export const BazaarAcceptsSchema = z.object({
  /** Payment scheme (e.g., "exact" for exact amount payments). */
  scheme: z.string(),
  /** Price in human-readable format (e.g., "$0.001") or atomic units. */
  price: z.string().optional(),
  /** Price amount in atomic units (for USDC, 6 decimals). */
  amount: z.string().optional(),
  /** Maximum amount required in atomic units. */
  maxAmountRequired: z.string().optional(),
  /** Network in CAIP-2 format (e.g., "eip155:8453" for Base Mainnet). */
  network: z.string(),
  /** Asset identifier (e.g., "USDC" or contract address). */
  asset: z.string().optional(),
  /** Recipient wallet address. */
  payTo: z.string().optional(),
  /** Recipient wallet address (alternative field name). */
  recipient: z.string().optional(),
});

export type BazaarAccepts = z.infer<typeof BazaarAcceptsSchema>;

/**
 * Bazaar extension metadata for a service.
 */
export const BazaarExtensionSchema = z.object({
  /** Whether the service is discoverable in Bazaar. */
  discoverable: z.boolean().optional(),
  /** Service category (e.g., "weather", "data", "ai"). */
  category: z.string().optional(),
  /** Tags for filtering/searching. */
  tags: z.array(z.string()).optional(),
});

export type BazaarExtension = z.infer<typeof BazaarExtensionSchema>;

/**
 * A single resource/endpoint from the Bazaar.
 */
export const BazaarResourceSchema = z.object({
  /** Full URL of the endpoint (including path). */
  url: z.string(),
  /** HTTP method (e.g., "GET", "POST"). */
  method: z.string().optional(),
  /** Human-readable description of what the endpoint does. */
  description: z.string().optional(),
  /** MIME type of the response. */
  mimeType: z.string().optional(),
  /** Payment acceptance requirements. */
  accepts: z.array(BazaarAcceptsSchema).optional(),
  /** Bazaar-specific metadata. */
  extensions: z
    .object({
      bazaar: BazaarExtensionSchema.optional(),
    })
    .optional(),
  /** Input schema (JSON Schema format). */
  inputSchema: z.record(z.unknown()).optional(),
  /** Output schema (JSON Schema format). */
  outputSchema: z.record(z.unknown()).optional(),
  /** Quality/reputation score (0-1). */
  qualityScore: z.number().optional(),
  /** Service provider name. */
  provider: z.string().optional(),
  /** When the service was registered. */
  registeredAt: z.string().optional(),
  /** When the service was last verified. */
  lastVerifiedAt: z.string().optional(),
});

export type BazaarResource = z.infer<typeof BazaarResourceSchema>;

/**
 * Paginated response from the Bazaar discovery API.
 */
export const BazaarListResponseSchema = z.object({
  /** List of discovered resources. */
  items: z.array(BazaarResourceSchema),
  /** Total number of resources available. */
  total: z.number().optional(),
  /** Pagination cursor for next page. */
  nextCursor: z.string().optional(),
  /** Whether there are more results. */
  hasMore: z.boolean().optional(),
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
 * const { items } = await fetchBazaarServices();
 *
 * // Filter by network and max price
 * const affordable = await fetchBazaarServices({
 *   network: "eip155:84532", // Base Sepolia
 *   maxPriceAtomic: "100000", // 0.1 USDC max
 * });
 *
 * // Search for specific capabilities
 * const weatherServices = await fetchBazaarServices({
 *   category: "weather",
 *   query: "forecast",
 * });
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

    console.log(`[Bazaar] Found ${validated.items.length} services`);

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
 * const { items } = await fetchBazaarServices();
 * const grouped = groupResourcesByBaseUrl(items);
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
 * Extract pricing information from a Bazaar resource.
 *
 * @description Parses the accepts array to find the most relevant pricing
 * information for display and budget checking.
 *
 * @param resource - The Bazaar resource.
 * @returns Pricing information or undefined if free/unknown.
 */
export function extractPricing(resource: BazaarResource): {
  amountAtomic: string;
  network: string;
  asset: string;
  recipient: string;
} | undefined {
  const accepts = resource.accepts?.[0];
  if (!accepts) {
    return undefined;
  }

  // Parse amount from various formats
  let amountAtomic = accepts.amount || accepts.maxAmountRequired || "0";

  // Handle human-readable price format (e.g., "$0.001")
  if (accepts.price && !amountAtomic) {
    const priceMatch = accepts.price.match(/\$?([\d.]+)/);
    if (priceMatch) {
      const usdAmount = parseFloat(priceMatch[1]);
      // Convert to atomic (6 decimals for USDC)
      amountAtomic = Math.round(usdAmount * 1_000_000).toString();
    }
  }

  return {
    amountAtomic,
    network: accepts.network || "eip155:84532",
    asset: accepts.asset || "USDC",
    recipient: accepts.payTo || accepts.recipient || "",
  };
}

/**
 * Convert a grouped set of Bazaar resources into a tool-compatible format.
 *
 * @description Transforms Bazaar resources into the format expected by our
 * tools collection, including endpoints, pricing hints, and reputation.
 *
 * @param baseUrl - The base URL for the tool.
 * @param resources - List of endpoints under this base URL.
 * @returns Tool-compatible object.
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
  // Use first resource's provider or derive from URL
  const firstResource = resources[0];
  let name: string;
  try {
    const url = new URL(baseUrl);
    name = firstResource?.provider || url.hostname.split(".")[0] || "Unknown Service";
  } catch {
    name = "Unknown Service";
  }

  // Aggregate descriptions
  const descriptions = resources
    .filter((r) => r.description)
    .map((r) => r.description!)
    .slice(0, 3);
  const description =
    descriptions.length > 0
      ? descriptions.join(". ")
      : `x402-compatible service at ${baseUrl}`;

  // Convert endpoints
  const endpoints = resources.map((r) => {
    let path: string;
    try {
      const url = new URL(r.url);
      path = url.pathname || "/";
    } catch {
      path = "/";
    }

    return {
      path,
      method: (r.method?.toUpperCase() || "GET") as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
      description: r.description,
      requestSchema: r.inputSchema,
      responseSchema: r.outputSchema,
    };
  });

  // Deduplicate endpoints by path+method
  const uniqueEndpoints = endpoints.filter(
    (ep, idx, arr) =>
      arr.findIndex((e) => e.path === ep.path && e.method === ep.method) === idx
  );

  // Calculate aggregate reputation from quality scores
  const qualityScores = resources
    .filter((r) => typeof r.qualityScore === "number")
    .map((r) => r.qualityScore!);
  const avgQuality =
    qualityScores.length > 0
      ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
      : 0.8; // Default to 0.8 if no scores

  // Find latest verification
  const verificationDates = resources
    .filter((r) => r.lastVerifiedAt)
    .map((r) => new Date(r.lastVerifiedAt!))
    .filter((d) => !isNaN(d.getTime()));
  const lastVerified =
    verificationDates.length > 0
      ? new Date(Math.max(...verificationDates.map((d) => d.getTime())))
      : undefined;

  // Extract pricing from first priced endpoint
  const pricedResource = resources.find((r) => r.accepts && r.accepts.length > 0);
  const pricing = pricedResource ? extractPricing(pricedResource) : undefined;

  return {
    source: "bazaar" as const,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    description,
    baseUrl,
    endpoints: uniqueEndpoints,
    reputation: {
      successRate: avgQuality,
      avgLatencyMs: 500, // Default, would need actual metrics
      disputeRate: 0,
      lastVerifiedAt: lastVerified,
    },
    pricingHints: pricing
      ? {
          typicalAmountAtomic: pricing.amountAtomic,
          network: pricing.network,
          asset: pricing.asset,
        }
      : undefined,
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
  const { items } = await fetchBazaarServices(options);

  if (items.length === 0) {
    console.log("[Bazaar] No services found");
    return [];
  }

  const grouped = groupResourcesByBaseUrl(items);
  const tools: Array<ReturnType<typeof convertToToolFormat>> = [];

  for (const [baseUrl, resources] of grouped) {
    const tool = convertToToolFormat(baseUrl, resources);
    tools.push(tool);
  }

  console.log(`[Bazaar] Converted ${tools.length} tools from ${items.length} endpoints`);

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
