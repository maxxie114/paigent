/**
 * x402 Client Configuration
 *
 * @description Configures and exports the x402 client for making paid HTTP requests.
 * Uses the official @x402/core, @x402/fetch, and @x402/evm packages.
 *
 * The x402 protocol enables HTTP-native payments where services can require
 * payment for API access using the HTTP 402 Payment Required status code.
 *
 * @see https://github.com/coinbase/x402
 * @see https://docs.cdp.coinbase.com/x402/welcome
 */

import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { getViemCompatibleAccount } from "./wallet";

/**
 * x402 client configuration options.
 */
export type X402ClientConfig = {
  /**
   * Networks to support. Defaults to Base Sepolia for testnet.
   *
   * @example ["eip155:84532"] for Base Sepolia
   * @example ["eip155:8453"] for Base Mainnet
   */
  networks?: string[];
};

/**
 * x402 client instance with utilities.
 */
export type X402ClientInstance = {
  /** The x402 core client. */
  client: x402Client;
  /** HTTP client for parsing headers. */
  httpClient: x402HTTPClient;
  /** Fetch wrapper with automatic payment handling. */
  fetchWithPayment: typeof fetch;
  /** The wallet address used for payments. */
  walletAddress: string;
};

/**
 * Cached client instance.
 */
let cachedInstance: X402ClientInstance | undefined;

/**
 * Create and configure an x402 client.
 *
 * @description Creates an x402 client configured with:
 * - CDP Server Wallet for signing EIP-3009 payments
 * - EVM exact scheme for Base Sepolia/Mainnet
 * - Fetch wrapper for automatic 402 handling
 *
 * The client handles the complete x402 payment flow:
 * 1. Detects 402 Payment Required responses
 * 2. Parses PAYMENT-REQUIRED headers
 * 3. Signs payments using EIP-3009 (Transfer With Authorization)
 * 4. Retries requests with PAYMENT-SIGNATURE headers
 * 5. Parses PAYMENT-RESPONSE for settlement confirmation
 *
 * @param config - Optional configuration.
 * @returns The configured x402 client instance.
 *
 * @example
 * ```typescript
 * const { fetchWithPayment } = await createX402Client();
 *
 * // Make a paid request - payment is handled automatically
 * const response = await fetchWithPayment("https://api.example.com/paid-endpoint");
 * const data = await response.json();
 * ```
 *
 * @see https://github.com/coinbase/x402/blob/main/docs/getting-started/quickstart-for-buyers.md
 */
export async function createX402Client(
  _config: X402ClientConfig = {}
): Promise<X402ClientInstance> {
  // Return cached instance if available
  if (cachedInstance) {
    return cachedInstance;
  }

  // Get viem-compatible signer from CDP Server Wallet
  const signer = await getViemCompatibleAccount();

  // Create x402 client
  const client = new x402Client();

  // Register EVM exact scheme for payment signing
  // This handles EIP-3009 Transfer With Authorization signing
  registerExactEvmScheme(client, { signer });

  // Create HTTP client for header parsing
  const httpClient = new x402HTTPClient(client);

  // Wrap fetch with automatic payment handling
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  // Create instance
  const instance: X402ClientInstance = {
    client,
    httpClient,
    fetchWithPayment,
    walletAddress: signer.address,
  };

  // Cache for reuse
  cachedInstance = instance;

  return instance;
}

/**
 * Get the cached x402 client instance.
 *
 * @description Returns the cached client if available, otherwise creates a new one.
 *
 * @returns The x402 client instance.
 */
export async function getX402ClientInstance(): Promise<X402ClientInstance> {
  return createX402Client();
}

/**
 * Clear the cached x402 client.
 *
 * @description Clears the cached client instance. Useful for testing or
 * when wallet credentials change.
 */
export function clearX402ClientCache(): void {
  cachedInstance = undefined;
}

/**
 * x402 protocol headers.
 *
 * @description Standard headers used in the x402 protocol.
 * These headers are Base64-encoded JSON.
 *
 * @see https://github.com/coinbase/x402/blob/main/docs/core-concepts/http-402.md
 */
export const X402_HEADERS = {
  /**
   * PAYMENT-REQUIRED header.
   * Sent by server in 402 response with payment requirements.
   */
  PAYMENT_REQUIRED: "PAYMENT-REQUIRED",

  /**
   * PAYMENT-SIGNATURE header.
   * Sent by client with signed payment payload.
   */
  PAYMENT_SIGNATURE: "PAYMENT-SIGNATURE",

  /**
   * PAYMENT-RESPONSE header.
   * Sent by server with settlement confirmation.
   */
  PAYMENT_RESPONSE: "PAYMENT-RESPONSE",
} as const;

/**
 * Supported networks for x402 payments.
 *
 * @description CAIP-2 network identifiers supported by the CDP facilitator.
 *
 * @see https://github.com/coinbase/x402/blob/main/docs/core-concepts/network-and-token-support.md
 */
export const SUPPORTED_NETWORKS = {
  /** Base Mainnet - Production network. */
  BASE_MAINNET: "eip155:8453",
  /** Base Sepolia - Testnet for development. */
  BASE_SEPOLIA: "eip155:84532",
  /** Solana Mainnet. */
  SOLANA_MAINNET: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  /** Solana Devnet. */
  SOLANA_DEVNET: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
} as const;

/**
 * USDC contract addresses for supported networks.
 *
 * @description EIP-3009 compatible USDC contracts.
 *
 * @see https://github.com/coinbase/x402/blob/main/docs/core-concepts/network-and-token-support.md
 */
export const USDC_ADDRESSES = {
  /** USDC on Base Mainnet. */
  BASE_MAINNET: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  /** USDC on Base Sepolia (testnet). */
  BASE_SEPOLIA: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
} as const;

/**
 * CDP Facilitator endpoints.
 *
 * @description The CDP facilitator handles payment verification and settlement.
 * It's fee-free for USDC payments on Base.
 *
 * @see https://github.com/coinbase/x402/blob/main/docs/core-concepts/facilitator.md
 */
export const CDP_FACILITATOR = {
  /** Production endpoint (requires CDP API keys). */
  MAINNET: "https://api.cdp.coinbase.com/platform/v2/x402",
  /** Verify endpoint path. */
  VERIFY_PATH: "/verify",
  /** Settle endpoint path. */
  SETTLE_PATH: "/settle",
} as const;
