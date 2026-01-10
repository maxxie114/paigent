/**
 * x402 Payment Fetch Wrapper
 *
 * @description Wraps fetch to handle x402 Payment Required responses.
 * Uses CDP Server Wallet for signing EIP-3009 payments.
 *
 * @see paigent-studio-spec.md Section 9
 * @see https://docs.cdp.coinbase.com/server-wallets/v2/api-reference/sign-x402-payment
 */

import { ObjectId } from "mongodb";
import { getCdpClient } from "./client";
import { getOrCreateAgentWallet, checkSufficientBalance } from "./wallet";
import { recordPaymentReceipt } from "@/lib/db/queries/budgets";
import { appendRunEvent } from "@/lib/db/queries/events";
import { validateUrl } from "@/lib/ssrf/validator";

/**
 * x402 canonical headers as specified by Coinbase.
 * DO NOT invent or modify these.
 *
 * @see paigent-studio-spec.md Appendix A.3
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
 * Payment requirement parsed from PAYMENT-REQUIRED header.
 */
export type PaymentRequirement = {
  /** Amount in atomic units. */
  amountAtomic: string;
  /** Network in CAIP-2 format. */
  network: string;
  /** Asset address. */
  asset: string;
  /** Recipient address. */
  recipient: string;
  /** Payment deadline (Unix timestamp). */
  deadline?: number;
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
    id: string;
    amountAtomic: string;
    txHash?: string;
  };
};

/**
 * Parse the PAYMENT-REQUIRED header.
 *
 * @param headerValue - The raw header value.
 * @returns Parsed payment requirement.
 */
function parsePaymentRequirement(headerValue: string): PaymentRequirement {
  // The header is typically Base64-encoded JSON
  try {
    const decoded = Buffer.from(headerValue, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);

    return {
      amountAtomic: parsed.amount?.toString() || "0",
      network: parsed.network || "eip155:84532",
      asset: parsed.asset || "USDC",
      recipient: parsed.recipient || "",
      deadline: parsed.deadline,
      rawHeader: headerValue,
    };
  } catch {
    // If not Base64 JSON, try plain JSON
    try {
      const parsed = JSON.parse(headerValue);
      return {
        amountAtomic: parsed.amount?.toString() || "0",
        network: parsed.network || "eip155:84532",
        asset: parsed.asset || "USDC",
        recipient: parsed.recipient || "",
        deadline: parsed.deadline,
        rawHeader: headerValue,
      };
    } catch {
      // Fallback: treat as opaque value
      return {
        amountAtomic: "0",
        network: "eip155:84532",
        asset: "USDC",
        recipient: "",
        rawHeader: headerValue,
      };
    }
  }
}

/**
 * Make a fetch request with x402 payment handling.
 *
 * @description Performs an HTTP request and handles 402 Payment Required responses
 * by signing and submitting payments using the CDP Server Wallet.
 *
 * @param url - The URL to fetch.
 * @param init - Fetch init options.
 * @param options - x402 options.
 * @returns The fetch result with payment information.
 *
 * @example
 * ```typescript
 * const result = await x402Fetch(
 *   "https://api.example.com/paid-endpoint",
 *   { method: "POST", body: JSON.stringify({ query: "test" }) },
 *   {
 *     maxPaymentAtomic: "1000000", // 1 USDC
 *     runId: new ObjectId(),
 *     stepId: "tool_call_1",
 *     workspaceId: new ObjectId(),
 *   }
 * );
 * ```
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

  // Validate URL for SSRF
  const urlValidation = await validateUrl(url, allowlist);
  if (!urlValidation.valid) {
    throw new Error(`SSRF validation failed: ${urlValidation.error}`);
  }

  // First attempt without payment
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
    },
    actor: { type: "system", id: "x402-fetch" },
  });

  // Check budget
  if (BigInt(requirement.amountAtomic) > BigInt(maxPaymentAtomic)) {
    throw new Error(
      `Payment ${requirement.amountAtomic} exceeds maximum allowed ${maxPaymentAtomic}`
    );
  }

  // Get wallet and check balance
  const wallet = await getOrCreateAgentWallet();
  const balanceCheck = await checkSufficientBalance(wallet.address, requirement.amountAtomic);

  if (!balanceCheck.sufficient) {
    throw new Error(
      `Insufficient balance. Required: ${requirement.amountAtomic}, ` +
        `Available: ${balanceCheck.currentBalanceAtomic}, ` +
        `Shortfall: ${balanceCheck.shortfallAtomic}`
    );
  }

  // Sign the payment using CDP
  const cdp = getCdpClient();

  const signResult = await cdp.evm.signX402Payment({
    address: wallet.address,
    paymentRequired: paymentRequiredHeader,
  });

  // Log payment sent event
  await appendRunEvent({
    workspaceId,
    runId,
    type: "PAYMENT_SENT",
    data: {
      stepId,
      amountAtomic: requirement.amountAtomic,
      walletAddress: wallet.address,
    },
    actor: { type: "system", id: "x402-fetch" },
  });

  // Retry request with payment signature
  const paidResponse = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      [X402_HEADERS.PAYMENT_SIGNATURE]: signResult.paymentSignature,
    },
    redirect: "error",
  });

  // Get payment response header
  const paymentResponseHeader = paidResponse.headers.get(X402_HEADERS.PAYMENT_RESPONSE);

  // Parse transaction hash from payment response if available
  let txHash: string | undefined;
  if (paymentResponseHeader) {
    try {
      const responseData = JSON.parse(
        Buffer.from(paymentResponseHeader, "base64").toString("utf-8")
      );
      txHash = responseData.txHash;
    } catch {
      // Ignore parse errors
    }
  }

  // Record payment receipt
  const receipt = await recordPaymentReceipt({
    workspaceId,
    runId,
    stepId,
    toolId,
    network: requirement.network,
    asset: requirement.asset,
    amountAtomic: requirement.amountAtomic,
    paymentRequiredHeaderB64: Buffer.from(paymentRequiredHeader).toString("base64"),
    paymentSignatureHeaderB64: Buffer.from(signResult.paymentSignature).toString("base64"),
    paymentResponseHeader: paymentResponseHeader || undefined,
    txHash,
    status: paidResponse.ok ? "settled" : "rejected",
  });

  // Log payment result
  await appendRunEvent({
    workspaceId,
    runId,
    type: paidResponse.ok ? "PAYMENT_CONFIRMED" : "PAYMENT_FAILED",
    data: {
      stepId,
      receiptId: receipt._id.toString(),
      amountAtomic: requirement.amountAtomic,
      txHash,
    },
    actor: { type: "system", id: "x402-fetch" },
  });

  if (!paidResponse.ok) {
    const errorText = await paidResponse.text();
    throw new Error(`Payment failed: ${paidResponse.status} - ${errorText}`);
  }

  return {
    response: await paidResponse.json(),
    paid: true,
    receipt: {
      id: receipt._id.toString(),
      amountAtomic: requirement.amountAtomic,
      txHash,
    },
  };
}
