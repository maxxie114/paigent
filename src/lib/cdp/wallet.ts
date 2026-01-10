/**
 * CDP Server Wallet Operations
 *
 * @description Operations for managing CDP Server Wallets.
 * Includes wallet creation, balance checking, and faucet funding.
 *
 * @see https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart
 * @see https://www.coinbase.com/developer-platform/products/faucet
 */

import { getCdpClient } from "./client";

/**
 * The name for the Paigent agent wallet.
 */
const AGENT_WALLET_NAME = "paigent-agent-wallet";

/**
 * Base Sepolia network identifier.
 */
const BASE_SEPOLIA_NETWORK = "base-sepolia";

/**
 * USDC contract address on Base Sepolia.
 */
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

/**
 * Wallet account type from CDP SDK.
 */
export type EvmAccount = {
  address: string;
  name?: string;
};

/**
 * Wallet balance type.
 */
export type WalletBalance = {
  /** ETH balance in wei. */
  ethWei: string;
  /** ETH balance formatted. */
  eth: string;
  /** USDC balance in atomic units (6 decimals). */
  usdcAtomic: string;
  /** USDC balance formatted. */
  usdc: string;
};

/**
 * Faucet request result.
 */
export type FaucetResult = {
  /** Whether the request was successful. */
  success: boolean;
  /** ETH transaction hash (if successful). */
  ethTxHash?: string;
  /** USDC transaction hash (if successful). */
  usdcTxHash?: string;
  /** Error message (if failed). */
  error?: string;
};

/**
 * Get or create the agent wallet.
 *
 * @description Creates a persistent wallet for the Paigent agent if it doesn't exist.
 * The wallet is identified by a fixed name to ensure consistency.
 *
 * @returns The wallet account.
 *
 * @example
 * ```typescript
 * const wallet = await getOrCreateAgentWallet();
 * console.log("Wallet address:", wallet.address);
 * ```
 */
export async function getOrCreateAgentWallet(): Promise<EvmAccount> {
  const cdp = getCdpClient();

  try {
    // Try to get existing wallet by name
    const account = await cdp.evm.getOrCreateAccount({
      name: AGENT_WALLET_NAME,
    });

    return {
      address: account.address,
      name: AGENT_WALLET_NAME,
    };
  } catch (error) {
    // If getOrCreate fails, try creating a new one
    console.error("Error getting/creating wallet:", error);

    const account = await cdp.evm.createAccount({
      name: `${AGENT_WALLET_NAME}-${Date.now()}`,
    });

    return {
      address: account.address,
      name: account.name,
    };
  }
}

/**
 * Get wallet balance.
 *
 * @description Fetches the ETH and USDC balances for a wallet address.
 *
 * @param address - The wallet address.
 * @returns The wallet balances.
 */
export async function getWalletBalance(address: string): Promise<WalletBalance> {
  const cdp = getCdpClient();

  try {
    // Get ETH balance
    const ethBalance = await cdp.evm.getBalance({
      address,
      network: BASE_SEPOLIA_NETWORK,
    });

    // Get USDC balance
    const usdcBalance = await cdp.evm.getTokenBalance({
      address,
      network: BASE_SEPOLIA_NETWORK,
      tokenAddress: USDC_BASE_SEPOLIA,
    });

    // Format balances
    const ethWei = ethBalance.toString();
    const eth = (Number(ethWei) / 1e18).toFixed(6);

    const usdcAtomic = usdcBalance.toString();
    const usdc = (Number(usdcAtomic) / 1e6).toFixed(2);

    return {
      ethWei,
      eth,
      usdcAtomic,
      usdc,
    };
  } catch (error) {
    console.error("Error fetching balance:", error);

    // Return zero balances on error
    return {
      ethWei: "0",
      eth: "0.000000",
      usdcAtomic: "0",
      usdc: "0.00",
    };
  }
}

/**
 * Request faucet funds.
 *
 * @description Requests test ETH and USDC from the CDP faucet for Base Sepolia.
 * The faucet has rate limits, so this may fail if called too frequently.
 *
 * @param address - The wallet address to fund.
 * @returns The faucet request result.
 *
 * @see https://www.coinbase.com/developer-platform/products/faucet
 */
export async function requestFaucetFunds(address: string): Promise<FaucetResult> {
  const cdp = getCdpClient();

  try {
    // Request ETH from faucet
    const ethFaucet = await cdp.evm.requestFaucet({
      address,
      network: BASE_SEPOLIA_NETWORK,
      token: "eth",
    });

    // Request USDC from faucet
    const usdcFaucet = await cdp.evm.requestFaucet({
      address,
      network: BASE_SEPOLIA_NETWORK,
      token: "usdc",
    });

    return {
      success: true,
      ethTxHash: ethFaucet.transactionHash,
      usdcTxHash: usdcFaucet.transactionHash,
    };
  } catch (error) {
    console.error("Faucet request error:", error);

    // Check if rate limited
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isRateLimited =
      errorMessage.toLowerCase().includes("rate") ||
      errorMessage.toLowerCase().includes("limit");

    return {
      success: false,
      error: isRateLimited
        ? "Faucet rate limited. Please try again later."
        : `Faucet request failed: ${errorMessage}`,
    };
  }
}

/**
 * Check if wallet has sufficient balance.
 *
 * @description Checks if the wallet has at least the specified amount of USDC.
 *
 * @param address - The wallet address.
 * @param requiredUsdcAtomic - The required USDC amount in atomic units.
 * @returns Object with balance check result.
 */
export async function checkSufficientBalance(
  address: string,
  requiredUsdcAtomic: string
): Promise<{
  sufficient: boolean;
  currentBalanceAtomic: string;
  requiredAtomic: string;
  shortfallAtomic: string;
}> {
  const balance = await getWalletBalance(address);
  const current = BigInt(balance.usdcAtomic);
  const required = BigInt(requiredUsdcAtomic);
  const shortfall = required > current ? (required - current).toString() : "0";

  return {
    sufficient: current >= required,
    currentBalanceAtomic: balance.usdcAtomic,
    requiredAtomic: requiredUsdcAtomic,
    shortfallAtomic: shortfall,
  };
}
