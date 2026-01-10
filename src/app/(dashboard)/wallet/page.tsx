"use client";

/**
 * Wallet Page
 *
 * @description Displays wallet balance and allows funding from faucet.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Wallet,
  RefreshCw,
  Copy,
  ExternalLink,
  Droplet,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Wallet balance type.
 */
type WalletBalance = {
  address: string;
  eth: string;
  usdc: string;
  ethWei: string;
  usdcAtomic: string;
};

/**
 * Wallet Page Component.
 */
export default function WalletPage() {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [funding, setFunding] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch balance
  const fetchBalance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wallet/balance");
      const data = await res.json();

      if (data.success) {
        setBalance({
          address: data.data.address,
          eth: data.data.balances.eth,
          usdc: data.data.balances.usdc,
          ethWei: data.data.raw.ethWei,
          usdcAtomic: data.data.raw.usdcAtomic,
        });
      } else {
        toast.error(data.error || "Failed to fetch balance");
      }
    } catch (error) {
      console.error("Error fetching balance:", error);
      toast.error("Failed to connect to wallet");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // Copy address
  const handleCopyAddress = useCallback(() => {
    if (balance?.address) {
      navigator.clipboard.writeText(balance.address);
      setCopied(true);
      toast.success("Address copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }
  }, [balance?.address]);

  // Request faucet funds
  const handleFundWallet = useCallback(async () => {
    setFunding(true);
    try {
      const res = await fetch("/api/wallet/fund", {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        toast.success("Faucet request submitted! Funds should arrive shortly.", {
          action: {
            label: "View TX",
            onClick: () => {
              if (data.data.explorer.eth) {
                window.open(data.data.explorer.eth, "_blank");
              }
            },
          },
        });

        // Refresh balance after delay
        setTimeout(fetchBalance, 5000);
      } else {
        toast.error(data.error || "Faucet request failed");
      }
    } catch (error) {
      console.error("Error requesting funds:", error);
      toast.error("Failed to request faucet funds");
    } finally {
      setFunding(false);
    }
  }, [fetchBalance]);

  // Format short address
  const shortAddress = balance?.address
    ? `${balance.address.slice(0, 6)}...${balance.address.slice(-4)}`
    : "";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Wallet</h2>
        <p className="text-muted-foreground">
          Manage your agent wallet and fund test transactions
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Main balance card */}
        <Card className="col-span-2 bg-gradient-to-br from-card to-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-accent to-primary flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle>Agent Wallet</CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      Base Sepolia
                    </Badge>
                    <span className="text-success text-xs">● Connected</span>
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={fetchBalance}
                disabled={loading}
              >
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Address */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <span className="text-sm font-mono text-muted-foreground">
                {loading ? (
                  <Skeleton className="h-4 w-48" />
                ) : (
                  balance?.address || "Not connected"
                )}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCopyAddress}
                disabled={!balance?.address}
              >
                {copied ? (
                  <CheckCircle className="w-4 h-4 text-success" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
              {balance?.address && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  asChild
                >
                  <a
                    href={`https://sepolia.basescan.org/address/${balance.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              )}
            </div>

            {/* Balances */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-muted/30">
                <p className="text-sm text-muted-foreground mb-1">ETH Balance</p>
                {loading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <p className="text-2xl font-bold">
                    {balance?.eth || "0.00"} ETH
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  For gas fees
                </p>
              </div>
              <div className="p-4 rounded-lg bg-payment/10 border border-payment/20">
                <p className="text-sm text-muted-foreground mb-1">USDC Balance</p>
                {loading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <p className="text-2xl font-bold text-payment">
                    ${balance?.usdc || "0.00"}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  For tool payments
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fund wallet card */}
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Droplet className="w-5 h-5 text-cyan-accent" />
              <CardTitle className="text-lg">Get Test Funds</CardTitle>
            </div>
            <CardDescription>
              Request free testnet ETH and USDC from the Coinbase Faucet
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The faucet provides test tokens for the Base Sepolia network. These
              have no real value and are for testing purposes only.
            </p>
            <Button
              onClick={handleFundWallet}
              disabled={funding || loading}
              className="w-full bg-gradient-to-r from-cyan-accent to-primary hover:opacity-90"
            >
              {funding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Requesting...
                </>
              ) : (
                <>
                  <Droplet className="w-4 h-4 mr-2" />
                  Request Faucet Funds
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Rate limited to prevent abuse. Please wait between requests.
            </p>
          </CardContent>
        </Card>

        {/* Recent transactions card */}
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Recent Payments</CardTitle>
            <CardDescription>
              Your latest tool payment transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Mock transactions */}
              {[
                { tool: "News API", amount: "-$0.25", time: "10m ago", status: "success" },
                { tool: "Data Scraper", amount: "-$0.15", time: "1h ago", status: "success" },
                { tool: "Faucet", amount: "+$10.00", time: "2h ago", status: "success" },
              ].map((tx, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div>
                    <p className="text-sm font-medium">{tx.tool}</p>
                    <p className="text-xs text-muted-foreground">{tx.time}</p>
                  </div>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      tx.amount.startsWith("-")
                        ? "text-destructive"
                        : "text-success"
                    )}
                  >
                    {tx.amount}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
