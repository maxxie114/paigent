/**
 * Main Dashboard Page
 *
 * @description Overview page showing recent runs, wallet status, and quick actions.
 */

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Play, Wallet, Clock, CheckCircle, AlertCircle, DollarSign } from "lucide-react";

// Note: DashboardSkeleton is defined below for potential use in Suspense boundaries
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

/**
 * Stats Card Component.
 */
function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ElementType;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {description}
          {trend && (
            <span
              className={
                trend.positive ? "text-success ml-2" : "text-destructive ml-2"
              }
            >
              {trend.positive ? "↑" : "↓"} {trend.value}
            </span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Recent Runs List.
 */
function RecentRunsList() {
  // This would fetch from API in production
  const runs = [
    {
      id: "1",
      intent: "Summarize top 10 AI news articles from today",
      status: "succeeded",
      createdAt: "10 minutes ago",
      cost: "$0.25",
    },
    {
      id: "2",
      intent: "Generate report on competitor pricing",
      status: "running",
      createdAt: "25 minutes ago",
      cost: "$0.15",
    },
    {
      id: "3",
      intent: "Analyze customer feedback from last week",
      status: "paused_for_approval",
      createdAt: "1 hour ago",
      cost: "$0.50",
    },
    {
      id: "4",
      intent: "Scrape product data from 5 websites",
      status: "failed",
      createdAt: "2 hours ago",
      cost: "$0.10",
    },
  ];

  const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    succeeded: { variant: "default", label: "Completed" },
    running: { variant: "secondary", label: "Running" },
    paused_for_approval: { variant: "outline", label: "Awaiting Approval" },
    failed: { variant: "destructive", label: "Failed" },
  };

  return (
    <div className="space-y-4">
      {runs.map((run) => (
        <div
          key={run.id}
          className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <div className="flex-1 min-w-0 mr-4">
            <p className="text-sm font-medium truncate">{run.intent}</p>
            <p className="text-xs text-muted-foreground">{run.createdAt}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-payment">{run.cost}</span>
            <Badge variant={statusConfig[run.status].variant}>
              {statusConfig[run.status].label}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Quick Actions Section.
 */
function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Link href="/runs/new">
        <Card className="bg-gradient-to-br from-cyan-accent/10 to-primary/10 border-cyan-accent/30 hover:border-cyan-accent/50 transition-colors cursor-pointer h-full">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-cyan-accent/20 flex items-center justify-center mb-3">
              <Play className="w-6 h-6 text-cyan-accent" />
            </div>
            <h3 className="font-semibold">New Run</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Start a new workflow
            </p>
          </CardContent>
        </Card>
      </Link>

      <Link href="/wallet">
        <Card className="bg-gradient-to-br from-payment/10 to-success/10 border-payment/30 hover:border-payment/50 transition-colors cursor-pointer h-full">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-payment/20 flex items-center justify-center mb-3">
              <Wallet className="w-6 h-6 text-payment" />
            </div>
            <h3 className="font-semibold">Fund Wallet</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Add testnet funds
            </p>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

/**
 * Dashboard Loading Skeleton.
 *
 * @description Loading placeholder for dashboard content.
 * Exported for use in Suspense boundaries.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <Skeleton className="h-96 col-span-2" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

/**
 * Main Dashboard Page.
 */
export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <div className="space-y-6">
      {/* Welcome message */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Welcome back! 👋
          </h2>
          <p className="text-muted-foreground">
            Here&apos;s what&apos;s happening with your workflows today.
          </p>
        </div>
        <Link href="/runs/new">
          <Button className="bg-gradient-to-r from-cyan-accent to-primary hover:opacity-90">
            <Play className="w-4 h-4 mr-2" />
            New Run
          </Button>
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatsCard
          title="Total Runs"
          value="128"
          description="Last 30 days"
          icon={Play}
          trend={{ value: "12%", positive: true }}
        />
        <StatsCard
          title="Success Rate"
          value="94%"
          description="Across all runs"
          icon={CheckCircle}
          trend={{ value: "3%", positive: true }}
        />
        <StatsCard
          title="Total Spent"
          value="$45.20"
          description="This month"
          icon={DollarSign}
        />
        <StatsCard
          title="Avg. Duration"
          value="2.4m"
          description="Per workflow"
          icon={Clock}
          trend={{ value: "15%", positive: true }}
        />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Recent runs */}
        <Card className="col-span-2 bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle>Recent Runs</CardTitle>
            <CardDescription>
              Your latest workflow executions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-64" />}>
              <RecentRunsList />
            </Suspense>
            <Link href="/runs">
              <Button variant="outline" className="w-full mt-4">
                View All Runs
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Quick actions */}
        <div className="space-y-6">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Common tasks at your fingertips
              </CardDescription>
            </CardHeader>
            <CardContent>
              <QuickActions />
            </CardContent>
          </Card>

          {/* Pending approvals */}
          <Card className="bg-card/50 backdrop-blur border-border/50 border-warning/30">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-warning" />
                <CardTitle className="text-base">Pending Approvals</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <p className="text-sm font-medium">Payment approval needed</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    $2.50 USDC for &quot;Data API&quot;
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" className="h-7">
                      Reject
                    </Button>
                    <Button size="sm" className="h-7 bg-success hover:bg-success/90">
                      Approve
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
