/**
 * Coinbase CDP Client
 *
 * @description Client for Coinbase Developer Platform (CDP) SDK.
 * Provides access to Server Wallet v2 functionality.
 *
 * @see https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart
 */

import { CdpClient } from "@coinbase/cdp-sdk";

/**
 * Cached CDP client instance.
 */
let cachedClient: CdpClient | undefined;

/**
 * Get or create the CDP client.
 *
 * @description Creates a singleton CDP client configured with API credentials.
 * The client is cached for reuse across requests.
 *
 * @returns The CDP client instance.
 * @throws {Error} If required environment variables are not set.
 *
 * @example
 * ```typescript
 * const cdp = getCdpClient();
 * const wallet = await cdp.evm.createAccount({ name: "my-wallet" });
 * ```
 */
export function getCdpClient(): CdpClient {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;
  const walletSecret = process.env.CDP_WALLET_SECRET;

  if (!apiKeyId || !apiKeySecret || !walletSecret) {
    throw new Error(
      "CDP credentials not configured. " +
        "Please set CDP_API_KEY_ID, CDP_API_KEY_SECRET, and CDP_WALLET_SECRET " +
        "in your .env.local file. Get credentials from: https://portal.cdp.coinbase.com/"
    );
  }

  // The CDP SDK auto-configures from environment variables
  // CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET
  cachedClient = new CdpClient();

  return cachedClient;
}

/**
 * Check if CDP credentials are configured.
 *
 * @returns True if all required credentials are set.
 */
export function isCdpConfigured(): boolean {
  return !!(
    process.env.CDP_API_KEY_ID &&
    process.env.CDP_API_KEY_SECRET &&
    process.env.CDP_WALLET_SECRET
  );
}
