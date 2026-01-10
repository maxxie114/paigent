/**
 * x402 Payment Fetch Wrapper
 *
 * @description Wraps fetch to handle x402 Payment Required responses using the
 * official @x402/fetch package. Uses CDP Server Wallet for signing EIP-3009 payments.
 *
 * The x402 protocol enables HTTP-native payments where:
 * 1. Client makes initial request
 * 2. Server responds with 402 Payment Required + PAYMENT-REQUIRED header
 * 3. Client signs payment using wallet
 * 4. Client retries with PAYMENT-SIGNATURE header
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
import { getOrCreateAgentWallet, checkSufficientBalance, getViemCompatibleAccount } from "./wallet";
import { recordPaymentReceipt } from "@/lib/db/queries/budgets";
import { appendRunEvent } from "@/lib/db/queries/events";
import { validateUrl } from "@/lib/ssrf/validator";

/**
 * x402 canonical headers as specified by Coinbase.
 * DO NOT invent or modify these.
 *
 * @see https://github.com/coinbase/x402/blob/main/docs/core-concepts/http-402.md
 */
const X402_HEADERS = {
  /** Server returns this header with payment requirements. */
  PAYMENT_REQUIRED: "PAYMENT-REQUIRED",
  /** Client sends this header with the signed payment. */
  PAYMENT_SIGNATURE: "PAYMENT-SIGNATURE",
  /** Server returns this header with payment confirmation. */
  PAYMENT_RESPONSE: "PAYMENT-RESPONSE",
} as const;

/**
 * Cached x402 client and fetch wrapper.
 */
let cachedClient: x402Client | undefined;
let cachedFetchWithPayment: typeof fetch | undefined;

/**
 * Get or create the x402 client with CDP Server Wallet signer.
 *
 * @description Creates an x402Client configured with the CDP Server Wallet
 * for signing EVM payments. The client handles:
 * - Detecting 402 Payment Required responses
 * - Parsing PAYMENT-REQUIRED headers
 * - Signing EIP-3009 transfer authorizations
 * - Constructing PAYMENT-SIGNATURE headers
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
 * Payment requirement parsed from PAYMENT-REQUIRED header.
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
  /** Raw header value for signing. */
  rawHeader: string;
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
 * Parse the PAYMENT-REQUIRED header.
 *
 * @description Parses the Base64-encoded JSON payment requirements from the
 * PAYMENT-REQUIRED header. The header contains information about:
 * - Amount to pay
 * - Network (CAIP-2 format)
 * - Asset/token
 * - Recipient address
 * - Deadline
 *
 * @param headerValue - The raw header value (Base64-encoded JSON).
 * @returns Parsed payment requirement.
 */
function parsePaymentRequirement(headerValue: string): PaymentRequirement {
  // The header is Base64-encoded JSON per x402 spec
  try {
    const decoded = Buffer.from(headerValue, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);

    // Handle both array format (accepts multiple requirements) and single object
    const requirement = Array.isArray(parsed) ? parsed[0] : parsed;

    return {
      amountAtomic: requirement.amount?.toString() || requirement.maxAmountRequired?.toString() || "0",
      network: requirement.network || requirement.networkId || "eip155:84532",
      asset: requirement.asset || requirement.resource || "USDC",
      recipient: requirement.recipient || requirement.payTo || "",
      deadline: requirement.deadline || requirement.validUntil,
      scheme: requirement.scheme || "exact",
      rawHeader: headerValue,
    };
  } catch {
    // If not Base64, try plain JSON
    try {
      const parsed = JSON.parse(headerValue);
      const requirement = Array.isArray(parsed) ? parsed[0] : parsed;

      return {
        amountAtomic: requirement.amount?.toString() || "0",
        network: requirement.network || "eip155:84532",
        asset: requirement.asset || "USDC",
        recipient: requirement.recipient || "",
        deadline: requirement.deadline,
        scheme: requirement.scheme || "exact",
        rawHeader: headerValue,
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
      };
    }
  }
}

/**
 * Make a fetch request with x402 payment handling.
 *
 * @description Performs an HTTP request and handles 402 Payment Required responses
 * using the official @x402/fetch package with CDP Server Wallet.
 *
 * The flow follows the x402 protocol:
 * 1. Initial request to the resource server
 * 2. If 402 received, parse PAYMENT-REQUIRED header
 * 3. Validate budget and check wallet balance
 * 4. Sign payment using CDP Server Wallet (EIP-3009)
 * 5. Retry request with PAYMENT-SIGNATURE header
 * 6. Parse PAYMENT-RESPONSE header for settlement confirmation
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
 * @throws {Error} If payment is rejected by the server.
 *
 * @example
 * ```typescript
 * const result = await x402Fetch(
 *   "https://api.example.com/paid-endpoint",
 *   { method: "POST", body: JSON.stringify({ query: "test" }) },
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

  // Handle 402 Payment Required
  const paymentRequiredHeader = initialResponse.headers.get(X402_HEADERS.PAYMENT_REQUIRED);

  if (!paymentRequiredHeader) {
    throw new Error("402 received but no PAYMENT-REQUIRED header");
  }

  // Parse payment requirement
  const requirement = parsePaymentRequirement(paymentRequiredHeader);

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
    },
    actor: { type: "system", id: "x402-fetch" },
  });

  // Check budget limit
  if (BigInt(requirement.amountAtomic) > BigInt(maxPaymentAtomic)) {
    throw new Error(
      `Payment ${requirement.amountAtomic} atomic units exceeds maximum allowed ${maxPaymentAtomic}`
    );
  }

  // Get wallet and verify sufficient balance
  const wallet = await getOrCreateAgentWallet();
  const balanceCheck = await checkSufficientBalance(wallet.address, requirement.amountAtomic);

  if (!balanceCheck.sufficient) {
    throw new Error(
      `Insufficient wallet balance. Required: ${requirement.amountAtomic} atomic, ` +
        `Available: ${balanceCheck.currentBalanceAtomic} atomic, ` +
        `Shortfall: ${balanceCheck.shortfallAtomic} atomic`
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
    },
    actor: { type: "system", id: "x402-fetch" },
  });

  // Make request with automatic payment handling via @x402/fetch
  // The wrapper will:
  // 1. Detect the 402 response
  // 2. Parse payment requirements
  // 3. Sign using registered EVM scheme
  // 4. Retry with PAYMENT-SIGNATURE header
  const paidResponse = await fetchWithPayment(url, {
    ...init,
    redirect: "error",
  });

  // Get settlement response from PAYMENT-RESPONSE header
  const paymentResponseHeader = paidResponse.headers.get(X402_HEADERS.PAYMENT_RESPONSE);

  // Parse transaction hash from settlement response
  let txHash: string | undefined;
  if (paymentResponseHeader) {
    try {
      const settlementResponse = httpClient.getPaymentSettleResponse(
        (name) => paidResponse.headers.get(name)
      );
      // The SettleResponse may have transaction info in the 'transaction' field
      // or as a direct property depending on the scheme
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
        txHash = responseData.txHash || responseData.transactionHash || responseData.transaction?.hash;
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
    paymentRequiredHeaderB64: paymentRequiredHeader,
    paymentSignatureHeaderB64: paidResponse.headers.get(X402_HEADERS.PAYMENT_SIGNATURE) || "",
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
    },
    actor: { type: "system", id: "x402-fetch" },
  });

  // Handle payment failure
  if (!paidResponse.ok) {
    const errorText = await paidResponse.text();
    throw new Error(`Payment request failed: ${paidResponse.status} - ${errorText}`);
  }

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
): Promise<(url: string, init?: RequestInit, allowlist?: string[]) => Promise<X402FetchResult>> {
  return async (url: string, init: RequestInit = {}, allowlist: string[] = []) => {
    return x402Fetch(url, init, { ...options, allowlist });
  };
}
