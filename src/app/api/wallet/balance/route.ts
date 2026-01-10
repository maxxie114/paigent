/**
 * Wallet Balance API Route
 *
 * @description Gets the agent wallet balance.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateAgentWallet, getWalletBalance } from "@/lib/cdp/wallet";
import { isCdpConfigured } from "@/lib/cdp/client";

/**
 * GET /api/wallet/balance
 *
 * @description Returns the agent wallet address and balances.
 */
 
export async function GET(_req: NextRequest): Promise<NextResponse> {
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

    // Get balance
    const balance = await getWalletBalance(wallet.address);

    return NextResponse.json({
      success: true,
      data: {
        address: wallet.address,
        network: "base-sepolia",
        balances: {
          eth: balance.eth,
          usdc: balance.usdc,
        },
        raw: {
          ethWei: balance.ethWei,
          usdcAtomic: balance.usdcAtomic,
        },
      },
    });
  } catch (error) {
    console.error("Error getting wallet balance:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get wallet balance",
      },
      { status: 500 }
    );
  }
}
