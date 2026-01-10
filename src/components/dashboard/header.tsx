"use client";

/**
 * Dashboard Header Component
 *
 * @description Top header bar with user menu, wallet balance, and notifications.
 */

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Wallet, Bell, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Page titles mapped to paths.
 */
const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/runs": "Workflow Runs",
  "/tools": "Tool Registry",
  "/wallet": "Wallet",
  "/analytics": "Analytics",
  "/settings": "Settings",
};

/**
 * Dashboard Header Component.
 */
export function DashboardHeader() {
  const pathname = usePathname();
  const [balance, setBalance] = useState<{ eth: string; usdc: string } | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [notifications, setNotifications] = useState(3);

  // Get page title
  const pageTitle = PAGE_TITLES[pathname] || "Paigent Studio";

  // Fetch wallet balance
  useEffect(() => {
    async function fetchBalance() {
      try {
        const res = await fetch("/api/wallet/balance");
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setBalance(data.data.balances);
          }
        }
      } catch (error) {
        console.error("Failed to fetch balance:", error);
      } finally {
        setLoadingBalance(false);
      }
    }

    fetchBalance();
  }, []);

  // Refresh balance
  const handleRefreshBalance = async () => {
    setLoadingBalance(true);
    try {
      const res = await fetch("/api/wallet/balance");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setBalance(data.data.balances);
        }
      }
    } catch (error) {
      console.error("Failed to refresh balance:", error);
    } finally {
      setLoadingBalance(false);
    }
  };

  return (
    <header className="h-16 border-b border-border/50 bg-card/30 backdrop-blur-sm">
      <div className="flex items-center justify-between h-full px-6">
        {/* Left side - Page title */}
        <div>
          <h1 className="text-xl font-semibold">{pageTitle}</h1>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-4">
          {/* Wallet balance */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50">
            <Wallet className="w-4 h-4 text-cyan-accent" />
            {loadingBalance ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : balance ? (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">
                  {balance.eth} ETH
                </span>
                <span className="font-medium text-payment">
                  ${balance.usdc} USDC
                </span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Not connected</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleRefreshBalance}
              disabled={loadingBalance}
            >
              <RefreshCw
                className={cn(
                  "w-3 h-3",
                  loadingBalance && "animate-spin"
                )}
              />
            </Button>
          </div>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                {notifications > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                  >
                    {notifications}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem className="flex flex-col items-start gap-1">
                <span className="font-medium">Run completed</span>
                <span className="text-xs text-muted-foreground">
                  Workflow "Summarize articles" finished successfully
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex flex-col items-start gap-1">
                <span className="font-medium">Approval needed</span>
                <span className="text-xs text-muted-foreground">
                  Payment of $2.50 requires approval
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex flex-col items-start gap-1">
                <span className="font-medium">New tool available</span>
                <span className="text-xs text-muted-foreground">
                  "Data Analysis API" added to registry
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User menu */}
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: "w-9 h-9",
              },
            }}
          />
        </div>
      </div>
    </header>
  );
}
