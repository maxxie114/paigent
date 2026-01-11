/**
 * CDP Server Wallet Operations
 *
 * @description Operations for managing CDP Server Wallets.
 * Includes wallet creation, balance checking, and faucet funding.
 *
 * @see https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart
 * @see https://www.coinbase.com/developer-platform/products/faucet
 */

import { toAccount, type LocalAccount } from "viem/accounts";
import { getCdpClient } from "./client";

/**
 * The name for the Paigent agent wallet.
 */
const AGENT_WALLET_NAME = "paigent-agent-wallet";

/**
 * Cached viem-compatible account for x402 signing.
 */
let cachedViemAccount: LocalAccount | undefined;

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

    // Validate the address before returning
    if (!account?.address) {
      throw new Error("CDP returned account without address");
    }

    console.log(`[Wallet] Got agent wallet: ${account.address}`);

    return {
      address: account.address,
      name: AGENT_WALLET_NAME,
    };
  } catch (error) {
    // If getOrCreate fails, try creating a new one
    console.error("[Wallet] Error getting/creating wallet:", error);

    try {
      const account = await cdp.evm.createAccount({
        name: `${AGENT_WALLET_NAME}-${Date.now()}`,
      });

      if (!account?.address) {
        throw new Error("CDP returned new account without address");
      }

      console.log(`[Wallet] Created new agent wallet: ${account.address}`);

      return {
        address: account.address,
        name: account.name,
      };
    } catch (createError) {
      console.error("[Wallet] Failed to create new wallet:", createError);
      throw createError;
    }
  }
}

/**
 * Native ETH contract address (used by CDP SDK to identify native token).
 */
const NATIVE_ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/**
 * Get wallet balance.
 *
 * @description Fetches the ETH and USDC balances for a wallet address using
 * the CDP SDK's listTokenBalances method.
 *
 * @param address - The wallet address.
 * @returns The wallet balances.
 *
 * @see https://docs.cdp.coinbase.com/server-wallets/v2/using-the-wallet-api/token-balances
 */
export async function getWalletBalance(address: string): Promise<WalletBalance> {
  const cdp = getCdpClient();

  // Initialize default values
  const defaultBalance: WalletBalance = {
    ethWei: "0",
    eth: "0.000000",
    usdcAtomic: "0",
    usdc: "0.00",
  };

  // Validate address format before making API call
  if (!address || typeof address !== "string") {
    console.error("Invalid wallet address: address is empty or not a string");
    return defaultBalance;
  }

  // Ensure address is in proper hex format
  const normalizedAddress = address.startsWith("0x") ? address : `0x${address}`;
  
  // Basic hex address validation (40 hex chars after 0x prefix)
  const hexAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  if (!hexAddressRegex.test(normalizedAddress)) {
    console.error(`Invalid wallet address format: ${normalizedAddress}`);
    return defaultBalance;
  }

  try {
    // Use listTokenBalances to get all token balances (including native ETH)
    const result = await cdp.evm.listTokenBalances({
      address: normalizedAddress as `0x${string}`,
      network: BASE_SEPOLIA_NETWORK,
    });

    // Initialize mutable values
    let ethWei = "0";
    let eth = "0.000000";
    let usdcAtomic = "0";
    let usdc = "0.00";

    // Safely check if result and balances exist and are iterable
    if (result && result.balances && Array.isArray(result.balances)) {
      // Parse balances from result
      for (const item of result.balances) {
        // Safely access nested properties
        if (!item?.token?.contractAddress || !item?.amount) {
          continue;
        }

        const contractAddress = item.token.contractAddress.toLowerCase();
        const amount = item.amount.amount;
        const decimals = item.amount.decimals ?? 18;

        if (contractAddress === NATIVE_ETH_ADDRESS.toLowerCase()) {
          // Native ETH balance
          ethWei = String(amount);
          eth = (Number(amount) / Math.pow(10, decimals)).toFixed(6);
        } else if (contractAddress === USDC_BASE_SEPOLIA.toLowerCase()) {
          // USDC balance
          usdcAtomic = String(amount);
          usdc = (Number(amount) / Math.pow(10, decimals)).toFixed(2);
        }
      }
    } else {
      console.warn("Unexpected API response structure:", {
        hasResult: !!result,
        hasBalances: !!(result && result.balances),
        isArray: !!(result && result.balances && Array.isArray(result.balances)),
      });
    }

    return {
      ethWei,
      eth,
      usdcAtomic,
      usdc,
    };
  } catch (error) {
    console.error("Error fetching balance:", error);

    // Return zero balances on error
    return defaultBalance;
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

/**
 * Get a viem-compatible account for x402 payment signing.
 *
 * @description Returns a viem LocalAccount that wraps the CDP Server Wallet.
 * This account can be used with x402 libraries that require a viem signer.
 *
 * The CDP Server Wallet v2 accounts are viem-compatible and support:
 * - signMessage
 * - signTypedData (EIP-712)
 * - signTransaction
 *
 * @returns A viem-compatible LocalAccount for signing.
 *
 * @example
 * ```typescript
 * import { registerExactEvmScheme } from "@x402/evm/exact/client";
 *
 * const signer = await getViemCompatibleAccount();
 * registerExactEvmScheme(client, { signer });
 * ```
 *
 * @see https://docs.cdp.coinbase.com/server-wallets/v2/introduction/welcome
 * @see https://github.com/coinbase/x402/blob/main/docs/getting-started/quickstart-for-buyers.md
 */
export async function getViemCompatibleAccount(): Promise<LocalAccount> {
  if (cachedViemAccount) {
    return cachedViemAccount;
  }

  const cdp = getCdpClient();

  // Get or create the agent wallet account
  const cdpAccount = await cdp.evm.getOrCreateAccount({
    name: AGENT_WALLET_NAME,
  });

  // Convert CDP account to viem LocalAccount
  // CDP Server Wallet v2 accounts implement the viem Account interface
  const viemAccount = toAccount(cdpAccount);

  // Cache for reuse
  cachedViemAccount = viemAccount;

  return viemAccount;
}

/**
 * Get the raw CDP EVM account for advanced operations.
 *
 * @description Returns the raw CDP SDK account object for operations that
 * require direct CDP SDK access (e.g., sending transactions, batch operations).
 *
 * @returns The CDP EVM account.
 *
 * @example
 * ```typescript
 * const account = await getCdpEvmAccount();
 * const result = await cdp.evm.sendTransaction({
 *   address: account.address,
 *   transaction: { to: "0x...", value: parseEther("0.01") },
 *   network: "base-sepolia",
 * });
 * ```
 */
export async function getCdpEvmAccount() {
  const cdp = getCdpClient();

  return await cdp.evm.getOrCreateAccount({
    name: AGENT_WALLET_NAME,
  });
}
