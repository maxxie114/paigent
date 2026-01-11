/**
 * CDP Server Wallet Operations
 *
 * @description Operations for managing CDP Server Wallets with multi-network support.
 * Includes wallet creation, balance checking, and faucet funding.
 *
 * Supports the following networks:
 * - Base Sepolia (testnet): eip155:84532
 * - Base Mainnet: eip155:8453
 *
 * @see https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart
 * @see https://www.coinbase.com/developer-platform/products/faucet
 */

import { toAccount, type LocalAccount } from "viem/accounts";
import { getCdpClient } from "./client";

// =============================================================================
// Constants
// =============================================================================

/**
 * The name for the Paigent agent wallet.
 */
const AGENT_WALLET_NAME = "paigent-agent-wallet";

/**
 * Cached viem-compatible account for x402 signing.
 */
let cachedViemAccount: LocalAccount | undefined;

/**
 * Native ETH contract address (used by CDP SDK to identify native token).
 */
const NATIVE_ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// =============================================================================
// Network Configuration
// =============================================================================

/**
 * CDP SDK supported network type for balance queries.
 *
 * @description The CDP SDK listTokenBalances endpoint supports these networks.
 * This type matches the SDK's ListEvmTokenBalancesNetwork type.
 */
type CdpBalanceNetworkName = "base-sepolia" | "base" | "ethereum";

/**
 * CDP SDK faucet supported network type.
 *
 * @description Faucet operations only support testnet networks.
 */
type CdpFaucetNetworkName = "base-sepolia" | "ethereum-sepolia";

/**
 * Network configuration type.
 */
type NetworkConfigEntry = {
  /** CDP SDK network name for balance queries. */
  cdpNetworkName: CdpBalanceNetworkName;
  /** CDP SDK faucet network name (if faucet is available). */
  faucetNetworkName?: CdpFaucetNetworkName;
  /** USDC contract address on this network. */
  usdcAddress: string;
  /** Human-readable network name. */
  displayName: string;
  /** Whether this is a testnet. */
  isTestnet: boolean;
  /** Whether faucet funding is available. */
  hasFaucet: boolean;
};

/**
 * Supported network configurations.
 *
 * @description Maps CAIP-2 network identifiers to CDP SDK network names
 * and USDC contract addresses.
 */
export const NETWORK_CONFIG: Record<string, NetworkConfigEntry> = {
  // Base Sepolia (testnet)
  "eip155:84532": {
    cdpNetworkName: "base-sepolia",
    faucetNetworkName: "base-sepolia",
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    displayName: "Base Sepolia",
    isTestnet: true,
    hasFaucet: true,
  },
  // Base Mainnet
  "eip155:8453": {
    cdpNetworkName: "base",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    displayName: "Base Mainnet",
    isTestnet: false,
    hasFaucet: false,
  },
  // Ethereum Mainnet (for future expansion)
  "eip155:1": {
    cdpNetworkName: "ethereum",
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    displayName: "Ethereum Mainnet",
    isTestnet: false,
    hasFaucet: false,
  },
};

/**
 * Default network (Base Sepolia for testnet development).
 */
export const DEFAULT_NETWORK = "eip155:84532";

/**
 * Get network configuration by CAIP-2 identifier.
 *
 * @param network - CAIP-2 network identifier (e.g., "eip155:84532").
 * @returns Network configuration or undefined if not supported.
 */
export function getNetworkConfig(network: string) {
  return NETWORK_CONFIG[network];
}

/**
 * Check if a network is supported.
 *
 * @param network - CAIP-2 network identifier.
 * @returns True if the network is supported.
 */
export function isNetworkSupported(network: string): boolean {
  return network in NETWORK_CONFIG;
}

/**
 * Get list of supported networks.
 *
 * @returns Array of supported CAIP-2 network identifiers.
 */
export function getSupportedNetworks(): string[] {
  return Object.keys(NETWORK_CONFIG);
}

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Wallet account type from CDP SDK.
 */
export type EvmAccount = {
  /** Wallet address (0x-prefixed). */
  address: string;
  /** Wallet name (optional). */
  name?: string;
};

/**
 * Wallet balance type for a specific network.
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
  /** Network this balance is for. */
  network?: string;
};

/**
 * Multi-network wallet balances.
 */
export type MultiNetworkBalance = {
  /** Balances by network. */
  byNetwork: Record<string, WalletBalance>;
  /** Wallet address. */
  address: string;
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

// =============================================================================
// Wallet Management
// =============================================================================

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

// =============================================================================
// Balance Operations
// =============================================================================

/**
 * Get wallet balance for a specific network.
 *
 * @description Fetches the ETH and USDC balances for a wallet address on
 * the specified network using the CDP SDK's listTokenBalances method.
 *
 * @param address - The wallet address.
 * @param network - CAIP-2 network identifier (default: Base Sepolia).
 * @returns The wallet balances.
 *
 * @example
 * ```typescript
 * // Get Base Sepolia balance
 * const balance = await getWalletBalance("0x...");
 *
 * // Get Base Mainnet balance
 * const mainnetBalance = await getWalletBalance("0x...", "eip155:8453");
 * ```
 *
 * @see https://docs.cdp.coinbase.com/server-wallets/v2/using-the-wallet-api/token-balances
 */
export async function getWalletBalance(
  address: string,
  network: string = DEFAULT_NETWORK
): Promise<WalletBalance> {
  const cdp = getCdpClient();

  // Initialize default values
  const defaultBalance: WalletBalance = {
    ethWei: "0",
    eth: "0.000000",
    usdcAtomic: "0",
    usdc: "0.00",
    network,
  };

  // Get network configuration
  const networkConfig = getNetworkConfig(network);
  if (!networkConfig) {
    console.error(`[Wallet] Unsupported network: ${network}`);
    return defaultBalance;
  }

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
      network: networkConfig.cdpNetworkName,
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
        } else if (
          contractAddress === networkConfig.usdcAddress.toLowerCase()
        ) {
          // USDC balance
          usdcAtomic = String(amount);
          usdc = (Number(amount) / Math.pow(10, decimals)).toFixed(2);
        }
      }
    } else {
      console.warn("Unexpected API response structure:", {
        hasResult: !!result,
        hasBalances: !!(result && result.balances),
        isArray: !!(
          result &&
          result.balances &&
          Array.isArray(result.balances)
        ),
      });
    }

    return {
      ethWei,
      eth,
      usdcAtomic,
      usdc,
      network,
    };
  } catch (error) {
    console.error(`Error fetching balance for ${network}:`, error);

    // Return zero balances on error
    return defaultBalance;
  }
}

/**
 * Get wallet balances across all supported networks.
 *
 * @description Fetches balances for all supported networks in parallel.
 *
 * @param address - The wallet address.
 * @returns Balances for all networks.
 *
 * @example
 * ```typescript
 * const balances = await getMultiNetworkBalance("0x...");
 * console.log("Base Sepolia USDC:", balances.byNetwork["eip155:84532"].usdc);
 * console.log("Base Mainnet USDC:", balances.byNetwork["eip155:8453"].usdc);
 * ```
 */
export async function getMultiNetworkBalance(
  address: string
): Promise<MultiNetworkBalance> {
  const networks = getSupportedNetworks();

  // Fetch all balances in parallel
  const balancePromises = networks.map(async (network) => {
    const balance = await getWalletBalance(address, network);
    return { network, balance };
  });

  const results = await Promise.all(balancePromises);

  // Build result object
  const byNetwork: Record<string, WalletBalance> = {};
  for (const { network, balance } of results) {
    byNetwork[network] = balance;
  }

  return {
    byNetwork,
    address,
  };
}

// =============================================================================
// Balance Checking
// =============================================================================

/**
 * Check if wallet has sufficient balance on a specific network.
 *
 * @description Checks if the wallet has at least the specified amount of USDC
 * on the specified network.
 *
 * @param address - The wallet address.
 * @param requiredUsdcAtomic - The required USDC amount in atomic units.
 * @param network - CAIP-2 network identifier (default: Base Sepolia).
 * @returns Object with balance check result.
 *
 * @example
 * ```typescript
 * // Check Base Sepolia balance
 * const check = await checkSufficientBalance("0x...", "1000000");
 *
 * // Check Base Mainnet balance
 * const mainnetCheck = await checkSufficientBalance("0x...", "1000000", "eip155:8453");
 * ```
 */
export async function checkSufficientBalance(
  address: string,
  requiredUsdcAtomic: string,
  network: string = DEFAULT_NETWORK
): Promise<{
  sufficient: boolean;
  currentBalanceAtomic: string;
  requiredAtomic: string;
  shortfallAtomic: string;
  network: string;
}> {
  const balance = await getWalletBalance(address, network);
  const current = BigInt(balance.usdcAtomic);
  const required = BigInt(requiredUsdcAtomic);
  const shortfall = required > current ? (required - current).toString() : "0";

  return {
    sufficient: current >= required,
    currentBalanceAtomic: balance.usdcAtomic,
    requiredAtomic: requiredUsdcAtomic,
    shortfallAtomic: shortfall,
    network,
  };
}

// =============================================================================
// Faucet Operations
// =============================================================================

/**
 * Request faucet funds.
 *
 * @description Requests test ETH and USDC from the CDP faucet for testnet networks.
 * The faucet has rate limits, so this may fail if called too frequently.
 *
 * Note: Faucet is only available for testnet networks (e.g., Base Sepolia).
 *
 * @param address - The wallet address to fund.
 * @param network - CAIP-2 network identifier (default: Base Sepolia).
 * @returns The faucet request result.
 *
 * @example
 * ```typescript
 * const result = await requestFaucetFunds("0x...");
 * if (result.success) {
 *   console.log("ETH tx:", result.ethTxHash);
 *   console.log("USDC tx:", result.usdcTxHash);
 * }
 * ```
 *
 * @see https://www.coinbase.com/developer-platform/products/faucet
 */
export async function requestFaucetFunds(
  address: string,
  network: string = DEFAULT_NETWORK
): Promise<FaucetResult> {
  const cdp = getCdpClient();

  // Get network configuration
  const networkConfig = getNetworkConfig(network);
  if (!networkConfig) {
    return {
      success: false,
      error: `Unsupported network: ${network}`,
    };
  }

  // Check if faucet is available for this network
  if (!networkConfig.hasFaucet) {
    return {
      success: false,
      error: `Faucet is not available for ${networkConfig.displayName}. Only testnet networks support faucet funding.`,
    };
  }

  try {
    // Ensure we have a faucet network name
    const faucetNetwork = networkConfig.faucetNetworkName;
    if (!faucetNetwork) {
      return {
        success: false,
        error: `Faucet network not configured for ${networkConfig.displayName}`,
      };
    }

    // Request ETH from faucet
    const ethFaucet = await cdp.evm.requestFaucet({
      address,
      network: faucetNetwork,
      token: "eth",
    });

    // Request USDC from faucet
    const usdcFaucet = await cdp.evm.requestFaucet({
      address,
      network: faucetNetwork,
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

// =============================================================================
// Viem Integration
// =============================================================================

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
 * Clear the cached viem account.
 *
 * @description Clears the cached account. Useful for testing or when
 * wallet credentials change.
 */
export function clearViemAccountCache(): void {
  cachedViemAccount = undefined;
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
