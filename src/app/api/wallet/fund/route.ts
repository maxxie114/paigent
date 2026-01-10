/**
 * Wallet Fund API Route
 *
 * @description Requests funds from the CDP faucet.
 *
 * @see https://www.coinbase.com/developer-platform/products/faucet
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateAgentWallet, requestFaucetFunds } from "@/lib/cdp/wallet";
import { isCdpConfigured } from "@/lib/cdp/client";

/**
 * POST /api/wallet/fund
 *
 * @description Requests test ETH and USDC from the Coinbase faucet.
 * Rate limited by the faucet service.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if CDP is configured
    if (!isCdpConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "CDP wallet not configured. Please set CDP credentials in environment variables.",
        },
        { status: 503 }
      );
    }

    // Get wallet
    const wallet = await getOrCreateAgentWallet();

    // Request faucet funds
    const result = await requestFaucetFunds(wallet.address);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Faucet request failed",
        },
        { status: 429 } // Rate limited
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        address: wallet.address,
        ethTxHash: result.ethTxHash,
        usdcTxHash: result.usdcTxHash,
        network: "base-sepolia",
        message:
          "Faucet request submitted. Funds should arrive within a few minutes.",
        explorer: {
          eth: result.ethTxHash
            ? `https://sepolia.basescan.org/tx/${result.ethTxHash}`
            : undefined,
          usdc: result.usdcTxHash
            ? `https://sepolia.basescan.org/tx/${result.usdcTxHash}`
            : undefined,
        },
      },
    });
  } catch (error) {
    console.error("Error requesting faucet funds:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Faucet request failed",
      },
      { status: 500 }
    );
  }
}
