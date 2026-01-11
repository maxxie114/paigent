/**
 * x402 Payment Fetch Wrapper
 *
 * @description Wraps fetch to handle x402 Payment Required responses using the
 * official @x402/fetch package. Uses CDP Server Wallet for signing EIP-3009 payments.
 *
 * Supports BOTH x402 protocol versions:
 * - **v2 (canonical)**: Payment requirements in PAYMENT-REQUIRED header (Base64 JSON)
 * - **v1 (legacy)**: Payment requirements in JSON response body with x402Version:1
 *
 * The x402 protocol enables HTTP-native payments where:
 * 1. Client makes initial request
 * 2. Server responds with 402 Payment Required
 *    - v2: PAYMENT-REQUIRED header with Base64-encoded requirements
 *    - v1: JSON body with { x402Version: 1, accepts: [...] }
 * 3. Client signs payment using wallet
 * 4. Client retries with payment header:
 *    - v2: PAYMENT-SIGNATURE header
 *    - v1: X-PAYMENT header
 * 5. Server verifies via facilitator, settles, returns resource + PAYMENT-RESPONSE
 *
 * @see https://github.com/coinbase/x402
 * @see https://docs.cdp.coinbase.com/x402/welcome
 * @see paigent-studio-spec.md Section 9
 */

import { ObjectId } from "mongodb";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import {
  getOrCreateAgentWallet,
  checkSufficientBalance,
  getViemCompatibleAccount,
} from "./wallet";
import { recordPaymentReceipt } from "@/lib/db/queries/budgets";
import { appendRunEvent } from "@/lib/db/queries/events";
import { validateUrl } from "@/lib/ssrf/validator";

// =============================================================================
// x402 Protocol Constants
// =============================================================================

/**
 * x402 canonical headers for v2 protocol.
 *
 * @see https://github.com/coinbase/x402/blob/main/docs/core-concepts/http-402.md
 */
const X402_HEADERS_V2 = {
  /** Server returns this header with payment requirements. */
  PAYMENT_REQUIRED: "PAYMENT-REQUIRED",
  /** Client sends this header with the signed payment. */
  PAYMENT_SIGNATURE: "PAYMENT-SIGNATURE",
  /** Server returns this header with payment confirmation. */
  PAYMENT_RESPONSE: "PAYMENT-RESPONSE",
} as const;

/**
 * x402 headers for v1 protocol (legacy).
 *
 * @see @x402/core README.md
 */
const X402_HEADERS_V1 = {
  /** Client sends this header with the signed payment (v1). */
  X_PAYMENT: "X-PAYMENT",
  /** Server returns this header with payment confirmation (v1). */
  X_PAYMENT_RESPONSE: "X-PAYMENT-RESPONSE",
} as const;

/**
 * Network name to CAIP-2 identifier mapping.
 *
 * @description Maps shorthand network names used by some x402 providers
 * to their standard CAIP-2 identifiers.
 */
const NETWORK_NAME_TO_CAIP2: Record<string, string> = {
  // EVM Networks
  base: "eip155:8453", // Base Mainnet
  "base-mainnet": "eip155:8453",
  "base-sepolia": "eip155:84532", // Base Sepolia (testnet)
  ethereum: "eip155:1", // Ethereum Mainnet
  mainnet: "eip155:1",
  sepolia: "eip155:11155111", // Ethereum Sepolia
  // Solana Networks
  solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", // Solana Mainnet
  "solana-mainnet": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "solana-devnet": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
};

/**
 * USDC contract addresses by network.
 *
 * @description Maps CAIP-2 network identifiers to USDC contract addresses.
 */
const USDC_ADDRESSES: Record<string, string> = {
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base Mainnet
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
  "eip155:1": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Ethereum Mainnet
};

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Cached x402 client and fetch wrapper.
 */
let cachedClient: x402Client | undefined;
let cachedFetchWithPayment: typeof fetch | undefined;

/**
 * Payment requirement parsed from x402 response (supports both v1 and v2).
 */
export type PaymentRequirement = {
  /** Amount in atomic units. */
  amountAtomic: string;
  /** Network in CAIP-2 format (e.g., "eip155:84532" for Base Sepolia). */
  network: string;
  /** Asset identifier (e.g., "USDC" or contract address). */
  asset: string;
  /** Recipient address. */
  recipient: string;
  /** Payment deadline (Unix timestamp). */
  deadline?: number;
  /** Scheme type (e.g., "exact"). */
  scheme?: string;
  /** Raw header/body value for signing (Base64-encoded JSON). */
  rawHeader: string;
  /** x402 protocol version (1 or 2). */
  x402Version: 1 | 2;
};

/**
 * x402 fetch options.
 */
export type X402FetchOptions = {
  /** Maximum payment amount allowed in atomic units. */
  maxPaymentAtomic: string;
  /** Run ID for event logging. */
  runId: ObjectId;
  /** Step ID for event logging. */
  stepId: string;
  /** Workspace ID for event logging. */
  workspaceId: ObjectId;
  /** Tool ID (optional). */
  toolId?: ObjectId;
  /** Tool allowlist for SSRF validation. */
  allowlist?: string[];
};

/**
 * x402 fetch result.
 */
export type X402FetchResult = {
  /** The response data. */
  response: unknown;
  /** Whether a payment was made. */
  paid: boolean;
  /** Payment receipt (if paid). */
  receipt?: {
    /** Receipt ID from database. */
    id: string;
    /** Amount paid in atomic units. */
    amountAtomic: string;
    /** Transaction hash (if available). */
    txHash?: string;
  };
};

/**
 * x402 v1 response body structure.
 *
 * @description Structure of the JSON body returned by x402 v1 providers
 * on a 402 Payment Required response.
 */
type X402V1ResponseBody = {
  x402Version: 1;
  accepts: Array<{
    scheme: string;
    network: string;
    maxAmountRequired: string | number;
    resource?: string;
    description?: string;
    mimeType?: string;
    payTo: string;
    maxTimeoutSeconds?: number;
    asset: string;
    extra?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
  }>;
  error?: string;
};

// =============================================================================
// Client Management
// =============================================================================

/**
 * Get or create the x402 client with CDP Server Wallet signer.
 *
 * @description Creates an x402Client configured with the CDP Server Wallet
 * for signing EVM payments. The client handles:
 * - Detecting 402 Payment Required responses
 * - Parsing payment requirements (v1 body or v2 header)
 * - Signing EIP-3009 transfer authorizations
 * - Constructing payment headers (X-PAYMENT for v1, PAYMENT-SIGNATURE for v2)
 *
 * @returns Object containing the x402Client and wrapped fetch function.
 *
 * @example
 * ```typescript
 * const { client, fetchWithPayment } = await getX402Client();
 * const response = await fetchWithPayment("https://api.example.com/paid-endpoint");
 * ```
 */
export async function getX402Client(): Promise<{
  client: x402Client;
  fetchWithPayment: typeof fetch;
  httpClient: x402HTTPClient;
}> {
  if (cachedClient && cachedFetchWithPayment) {
    return {
      client: cachedClient,
      fetchWithPayment: cachedFetchWithPayment,
      httpClient: new x402HTTPClient(cachedClient),
    };
  }

  // Get the viem-compatible signer from CDP Server Wallet
  const signer = await getViemCompatibleAccount();

  // Create x402 client and register the EVM exact scheme
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });

  // Wrap fetch with automatic payment handling
  // This wrapper supports both v1 and v2 protocols
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  // Cache for reuse
  cachedClient = client;
  cachedFetchWithPayment = fetchWithPayment;

  return {
    client,
    fetchWithPayment,
    httpClient: new x402HTTPClient(client),
  };
}

/**
 * Clear the cached x402 client.
 *
 * @description Useful for testing or when wallet credentials change.
 */
export function clearX402ClientCache(): void {
  cachedClient = undefined;
  cachedFetchWithPayment = undefined;
}

// =============================================================================
// Network Utilities
// =============================================================================

/**
 * Normalize a network identifier to CAIP-2 format.
 *
 * @description Converts shorthand network names (e.g., "base", "solana") to
 * their standard CAIP-2 identifiers (e.g., "eip155:8453").
 *
 * @param networkRaw - Raw network identifier from provider.
 * @returns CAIP-2 formatted network identifier.
 *
 * @example
 * ```typescript
 * normalizeNetwork("base"); // Returns "eip155:8453"
 * normalizeNetwork("eip155:84532"); // Returns "eip155:84532" (already CAIP-2)
 * ```
 */
function normalizeNetwork(networkRaw: string | undefined): string {
  if (!networkRaw) {
    return "eip155:84532"; // Default to Base Sepolia
  }

  // If already in CAIP-2 format, return as-is
  if (networkRaw.includes(":")) {
    return networkRaw;
  }

  // Look up in mapping
  const normalized = NETWORK_NAME_TO_CAIP2[networkRaw.toLowerCase()];
  if (normalized) {
    return normalized;
  }

  // Unknown format - return as-is and log warning
  console.warn(`[x402] Unknown network format: ${networkRaw}, using as-is`);
  return networkRaw;
}

/**
 * Check if a network is supported for payments.
 *
 * @param network - CAIP-2 network identifier.
 * @returns True if the network is supported.
 */
export function isNetworkSupported(network: string): boolean {
  return network in USDC_ADDRESSES;
}

/**
 * Get USDC address for a network.
 *
 * @param network - CAIP-2 network identifier.
 * @returns USDC contract address or undefined if not supported.
 */
export function getUsdcAddress(network: string): string | undefined {
  return USDC_ADDRESSES[network];
}

// =============================================================================
// Payment Requirement Parsing
// =============================================================================

/**
 * Parse x402 v2 PAYMENT-REQUIRED header.
 *
 * @description Parses the Base64-encoded JSON payment requirements from the
 * PAYMENT-REQUIRED header (x402 v2 protocol).
 *
 * @param headerValue - The raw header value (Base64-encoded JSON).
 * @returns Parsed payment requirement.
 */
function parseV2PaymentRequirement(headerValue: string): PaymentRequirement {
  try {
    const decoded = Buffer.from(headerValue, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);

    // Handle both array format (accepts multiple requirements) and single object
    const requirement = Array.isArray(parsed) ? parsed[0] : parsed;

    return {
      amountAtomic:
        requirement.amount?.toString() ||
        requirement.maxAmountRequired?.toString() ||
        "0",
      network: normalizeNetwork(requirement.network || requirement.networkId),
      asset: requirement.asset || requirement.resource || "USDC",
      recipient: requirement.recipient || requirement.payTo || "",
      deadline: requirement.deadline || requirement.validUntil,
      scheme: requirement.scheme || "exact",
      rawHeader: headerValue,
      x402Version: 2,
    };
  } catch {
    // If not Base64, try plain JSON
    try {
      const parsed = JSON.parse(headerValue);
      const requirement = Array.isArray(parsed) ? parsed[0] : parsed;

      return {
        amountAtomic: requirement.amount?.toString() || "0",
        network: normalizeNetwork(requirement.network),
        asset: requirement.asset || "USDC",
        recipient: requirement.recipient || "",
        deadline: requirement.deadline,
        scheme: requirement.scheme || "exact",
        rawHeader: headerValue,
        x402Version: 2,
      };
    } catch {
      // Fallback: treat as opaque value
      return {
        amountAtomic: "0",
        network: "eip155:84532",
        asset: "USDC",
        recipient: "",
        scheme: "exact",
        rawHeader: headerValue,
        x402Version: 2,
      };
    }
  }
}

/**
 * Parse x402 v1 response body.
 *
 * @description Parses payment requirements from the JSON response body
 * (x402 v1 protocol). This format has requirements in the `accepts` array.
 *
 * @param body - The parsed JSON body from the 402 response.
 * @returns Parsed payment requirement.
 */
function parseV1PaymentRequirement(body: X402V1ResponseBody): PaymentRequirement {
  const firstAccept = body.accepts[0];

  if (!firstAccept) {
    throw new Error("x402 v1 response has empty accepts array");
  }

  const network = normalizeNetwork(firstAccept.network);

  return {
    amountAtomic: String(firstAccept.maxAmountRequired || "0"),
    network,
    asset: firstAccept.asset || "USDC",
    recipient: firstAccept.payTo || "",
    deadline: firstAccept.maxTimeoutSeconds
      ? Math.floor(Date.now() / 1000) + firstAccept.maxTimeoutSeconds
      : undefined,
    scheme: firstAccept.scheme || "exact",
    // Encode the full body as Base64 for consistency with v2
    rawHeader: Buffer.from(JSON.stringify(body), "utf-8").toString("base64"),
    x402Version: 1,
  };
}

/**
 * Detect x402 version and parse payment requirements.
 *
 * @description Attempts to parse payment requirements from either:
 * - v2: PAYMENT-REQUIRED header (Base64 JSON)
 * - v1: JSON response body with x402Version: 1
 *
 * @param response - The 402 response object.
 * @returns Parsed payment requirement with version info.
 * @throws {Error} If neither v1 nor v2 requirements are found.
 */
async function parsePaymentRequirement(
  response: Response
): Promise<PaymentRequirement> {
  // Try v2 first: PAYMENT-REQUIRED header
  const v2Header = response.headers.get(X402_HEADERS_V2.PAYMENT_REQUIRED);
  if (v2Header) {
    console.log("[x402] Detected v2 protocol (PAYMENT-REQUIRED header)");
    return parseV2PaymentRequirement(v2Header);
  }

  // Try v1: JSON body with x402Version: 1
  let responseBody: unknown;
  try {
    const responseText = await response.text();
    if (responseText) {
      responseBody = JSON.parse(responseText);
    }
  } catch {
    // Ignore parse errors
  }

  if (
    responseBody &&
    typeof responseBody === "object" &&
    "x402Version" in responseBody &&
    (responseBody as { x402Version: unknown }).x402Version === 1 &&
    "accepts" in responseBody &&
    Array.isArray((responseBody as { accepts: unknown }).accepts)
  ) {
    console.log("[x402] Detected v1 protocol (JSON body with x402Version: 1)");
    return parseV1PaymentRequirement(responseBody as X402V1ResponseBody);
  }

  // Neither format found - provide detailed error
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  throw new Error(
    `402 received but payment requirements could not be parsed. ` +
      `Expected either PAYMENT-REQUIRED header (v2) or JSON body with { x402Version: 1, accepts: [...] } (v1). ` +
      `Response headers: ${JSON.stringify(responseHeaders)}. ` +
      `Body preview: ${JSON.stringify(responseBody).slice(0, 500)}`
  );
}

// =============================================================================
// Main x402 Fetch Function
// =============================================================================

/**
 * Make a fetch request with x402 payment handling.
 *
 * @description Performs an HTTP request and handles 402 Payment Required responses
 * using the official @x402/fetch package with CDP Server Wallet.
 *
 * Supports BOTH x402 protocol versions:
 * - **v2**: PAYMENT-REQUIRED header → PAYMENT-SIGNATURE response
 * - **v1**: JSON body with accepts → X-PAYMENT response
 *
 * The flow follows the x402 protocol:
 * 1. Initial request to the resource server
 * 2. If 402 received, detect version and parse payment requirements
 * 3. Validate budget and check wallet balance
 * 4. Sign payment using CDP Server Wallet (EIP-3009)
 * 5. Retry request with appropriate payment header
 * 6. Parse settlement confirmation from response headers
 * 7. Record payment receipt in database
 *
 * @param url - The URL to fetch.
 * @param init - Fetch init options.
 * @param options - x402 options including budget limits and logging context.
 * @returns The fetch result with response data and payment information.
 *
 * @throws {Error} If SSRF validation fails.
 * @throws {Error} If payment exceeds budget.
 * @throws {Error} If wallet has insufficient balance.
 * @throws {Error} If network is not supported.
 * @throws {Error} If payment is rejected by the server.
 *
 * @example
 * ```typescript
 * const result = await x402Fetch(
 *   "https://api.example.com/paid-endpoint",
 *   { method: "POST", body: JSON.stringify({ symbol: "bitcoin" }) },
 *   {
 *     maxPaymentAtomic: "1000000", // 1 USDC (6 decimals)
 *     runId: new ObjectId(),
 *     stepId: "tool_call_1",
 *     workspaceId: new ObjectId(),
 *   }
 * );
 *
 * if (result.paid) {
 *   console.log("Payment made:", result.receipt);
 * }
 * ```
 *
 * @see https://github.com/coinbase/x402/blob/main/docs/getting-started/quickstart-for-buyers.md
 */
export async function x402Fetch(
  url: string,
  init: RequestInit = {},
  options: X402FetchOptions
): Promise<X402FetchResult> {
  const {
    maxPaymentAtomic,
    runId,
    stepId,
    workspaceId,
    toolId,
    allowlist = [],
  } = options;

  // Validate URL for SSRF protection
  const urlValidation = await validateUrl(url, allowlist);
  if (!urlValidation.valid) {
    throw new Error(`SSRF validation failed: ${urlValidation.error}`);
  }

  console.log(`[x402] Making initial request to ${url}`);

  // First attempt without payment to check if payment is required
  const initialResponse = await fetch(url, {
    ...init,
    redirect: "error", // SSRF protection: no redirects
  });

  // If not 402, return response directly
  if (initialResponse.status !== 402) {
    if (!initialResponse.ok) {
      const errorText = await initialResponse.text();
      throw new Error(`Request failed: ${initialResponse.status} - ${errorText}`);
    }

    return {
      response: await initialResponse.json(),
      paid: false,
    };
  }

  console.log("[x402] Received 402 Payment Required, parsing requirements...");

  // Parse payment requirements (supports both v1 and v2)
  const requirement = await parsePaymentRequirement(initialResponse);

  console.log(
    `[x402] Payment requirement parsed (v${requirement.x402Version}): ` +
      `${requirement.amountAtomic} atomic ${requirement.asset} on ${requirement.network} to ${requirement.recipient}`
  );

  // Log 402 received event
  await appendRunEvent({
    workspaceId,
    runId,
    type: "402_RECEIVED",
    data: {
      stepId,
      amountAtomic: requirement.amountAtomic,
      asset: requirement.asset,
      network: requirement.network,
      scheme: requirement.scheme,
      recipient: requirement.recipient,
      x402Version: requirement.x402Version,
    },
    actor: { type: "system", id: "x402-fetch" },
  });

  // Check if network is supported
  if (!isNetworkSupported(requirement.network)) {
    throw new Error(
      `Payment network "${requirement.network}" is not supported. ` +
        `Supported networks: ${Object.keys(USDC_ADDRESSES).join(", ")}. ` +
        `This tool may require a different network configuration.`
    );
  }

  // Check budget limit
  if (BigInt(requirement.amountAtomic) > BigInt(maxPaymentAtomic)) {
    throw new Error(
      `Payment ${requirement.amountAtomic} atomic units exceeds maximum allowed ${maxPaymentAtomic}. ` +
        `Increase the payment limit in the workflow node or workspace settings.`
    );
  }

  // Get wallet and verify sufficient balance
  const wallet = await getOrCreateAgentWallet();
  const balanceCheck = await checkSufficientBalance(
    wallet.address,
    requirement.amountAtomic,
    requirement.network
  );

  if (!balanceCheck.sufficient) {
    throw new Error(
      `Insufficient wallet balance on ${requirement.network}. ` +
        `Required: ${requirement.amountAtomic} atomic USDC, ` +
        `Available: ${balanceCheck.currentBalanceAtomic} atomic USDC, ` +
        `Shortfall: ${balanceCheck.shortfallAtomic} atomic USDC. ` +
        `Please fund your wallet via the /wallet page.`
    );
  }

  // Get the x402 client with payment handling
  const { fetchWithPayment, httpClient } = await getX402Client();

  // Log payment initiation
  await appendRunEvent({
    workspaceId,
    runId,
    type: "PAYMENT_SENT",
    data: {
      stepId,
      amountAtomic: requirement.amountAtomic,
      walletAddress: wallet.address,
      network: requirement.network,
      x402Version: requirement.x402Version,
    },
    actor: { type: "system", id: "x402-fetch" },
  });

  console.log(
    `[x402] Signing and sending payment from ${wallet.address} (v${requirement.x402Version} protocol)...`
  );

  // Make request with automatic payment handling via @x402/fetch
  // The wrapper handles both v1 (X-PAYMENT) and v2 (PAYMENT-SIGNATURE) protocols
  const paidResponse = await fetchWithPayment(url, {
    ...init,
    redirect: "error",
  });

  // Get settlement response from headers (try both v2 and v1 header names)
  const paymentResponseHeader =
    paidResponse.headers.get(X402_HEADERS_V2.PAYMENT_RESPONSE) ||
    paidResponse.headers.get(X402_HEADERS_V1.X_PAYMENT_RESPONSE);

  // Get payment signature from headers (for receipt recording)
  const paymentSignatureHeader =
    paidResponse.headers.get(X402_HEADERS_V2.PAYMENT_SIGNATURE) ||
    paidResponse.headers.get(X402_HEADERS_V1.X_PAYMENT);

  // Parse transaction hash from settlement response
  let txHash: string | undefined;
  if (paymentResponseHeader) {
    try {
      const settlementResponse = httpClient.getPaymentSettleResponse((name) =>
        paidResponse.headers.get(name)
      );
      const txData = settlementResponse?.transaction;
      if (txData && typeof txData === "object" && "hash" in txData) {
        txHash = (txData as { hash?: string }).hash;
      }
    } catch {
      // Try manual parsing if httpClient fails
      try {
        const responseData = JSON.parse(
          Buffer.from(paymentResponseHeader, "base64").toString("utf-8")
        );
        txHash =
          responseData.txHash ||
          responseData.transactionHash ||
          responseData.transaction?.hash;
      } catch {
        // Ignore parse errors - txHash will remain undefined
      }
    }
  }

  // Determine if payment was actually made
  const paymentMade = paidResponse.ok && paymentResponseHeader !== null;

  // Record payment receipt in database
  const receipt = await recordPaymentReceipt({
    workspaceId,
    runId,
    stepId,
    toolId,
    network: requirement.network,
    asset: requirement.asset,
    amountAtomic: requirement.amountAtomic,
    paymentRequiredHeaderB64: requirement.rawHeader,
    paymentSignatureHeaderB64: paymentSignatureHeader || "",
    paymentResponseHeader: paymentResponseHeader || undefined,
    txHash,
    status: paidResponse.ok ? "settled" : "rejected",
  });

  // Log payment result event
  await appendRunEvent({
    workspaceId,
    runId,
    type: paidResponse.ok ? "PAYMENT_CONFIRMED" : "PAYMENT_FAILED",
    data: {
      stepId,
      receiptId: receipt._id.toString(),
      amountAtomic: requirement.amountAtomic,
      txHash,
      status: paidResponse.ok ? "settled" : "rejected",
      x402Version: requirement.x402Version,
    },
    actor: { type: "system", id: "x402-fetch" },
  });

  // Handle payment failure
  if (!paidResponse.ok) {
    const errorText = await paidResponse.text();
    throw new Error(
      `Payment request failed: ${paidResponse.status} - ${errorText}`
    );
  }

  console.log(
    `[x402] Payment successful! Receipt: ${receipt._id.toString()}, TxHash: ${txHash || "pending"}`
  );

  return {
    response: await paidResponse.json(),
    paid: paymentMade,
    receipt: paymentMade
      ? {
          id: receipt._id.toString(),
          amountAtomic: requirement.amountAtomic,
          txHash,
        }
      : undefined,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a pre-configured x402 fetch function for repeated use.
 *
 * @description Creates a fetch function with x402 payment handling that can be
 * reused across multiple requests with the same configuration.
 *
 * @param options - Default options for all requests.
 * @returns A fetch function that handles x402 payments.
 *
 * @example
 * ```typescript
 * const paidFetch = await createX402Fetch({
 *   maxPaymentAtomic: "5000000", // 5 USDC max per request
 *   runId: myRunId,
 *   stepId: "batch_calls",
 *   workspaceId: myWorkspaceId,
 * });
 *
 * const result1 = await paidFetch("https://api1.example.com/data");
 * const result2 = await paidFetch("https://api2.example.com/data");
 * ```
 */
export async function createX402Fetch(
  options: Omit<X402FetchOptions, "allowlist">
): Promise<
  (url: string, init?: RequestInit, allowlist?: string[]) => Promise<X402FetchResult>
> {
  return async (
    url: string,
    init: RequestInit = {},
    allowlist: string[] = []
  ) => {
    return x402Fetch(url, init, { ...options, allowlist });
  };
}
