"use client";

/**
 * Dashboard Sidebar Component
 *
 * @description Main navigation sidebar for the dashboard.
 * Features glassmorphic styling and animated navigation items.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Home, 
  Play, 
  Wrench, 
  Wallet, 
  Settings, 
  BarChart3,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Navigation items configuration.
 */
const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: Home,
    description: "Overview and recent activity",
  },
  {
    label: "Runs",
    href: "/runs",
    icon: Play,
    description: "Workflow executions",
  },
  {
    label: "Tools",
    href: "/tools",
    icon: Wrench,
    description: "Available tools and APIs",
  },
  {
    label: "Wallet",
    href: "/wallet",
    icon: Wallet,
    description: "Balance and transactions",
  },
  {
    label: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    description: "Usage and spending",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Workspace configuration",
  },
];

/**
 * Dashboard Sidebar Component.
 */
export function DashboardSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "relative flex flex-col h-full border-r border-border/50",
        "bg-card/50 backdrop-blur-xl",
        "transition-all duration-300 ease-in-out",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-border/50">
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-2 transition-opacity duration-200",
            collapsed && "opacity-0 pointer-events-none"
          )}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-accent to-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold bg-gradient-to-r from-cyan-accent to-primary bg-clip-text text-transparent">
            Paigent
          </span>
        </Link>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg",
                    "transition-all duration-200",
                    "group relative",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-primary" />
                  )}

                  <Icon
                    className={cn(
                      "w-5 h-5 shrink-0 transition-transform duration-200",
                      "group-hover:scale-110"
                    )}
                  />

                  <span
                    className={cn(
                      "font-medium whitespace-nowrap transition-opacity duration-200",
                      collapsed && "opacity-0 w-0 overflow-hidden"
                    )}
                  >
                    {item.label}
                  </span>

                  {/* Tooltip for collapsed state */}
                  {collapsed && (
                    <div
                      className={cn(
                        "absolute left-full ml-2 px-2 py-1 rounded-md",
                        "bg-popover text-popover-foreground shadow-lg",
                        "text-sm whitespace-nowrap",
                        "opacity-0 group-hover:opacity-100",
                        "pointer-events-none",
                        "transition-opacity duration-200",
                        "z-50"
                      )}
                    >
                      {item.label}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div
        className={cn(
          "p-4 border-t border-border/50",
          "transition-opacity duration-200",
          collapsed && "opacity-0"
        )}
      >
        <div className="text-xs text-muted-foreground">
          <p>Base Sepolia Testnet</p>
          <p className="text-cyan-accent">● Connected</p>
        </div>
      </div>
    </aside>
  );
}
