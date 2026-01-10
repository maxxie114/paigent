"use client";

/**
 * Analytics Page
 *
 * @description Displays usage statistics and spending analytics.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Play,
  CheckCircle,
  Clock,
  Zap,
} from "lucide-react";

/**
 * Stat card component.
 */
function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  change: number;
  changeLabel: string;
  icon: React.ElementType;
  color: string;
}) {
  const isPositive = change >= 0;

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-1 mt-1">
          {isPositive ? (
            <TrendingUp className="h-3 w-3 text-success" />
          ) : (
            <TrendingDown className="h-3 w-3 text-destructive" />
          )}
          <span
            className={`text-xs ${
              isPositive ? "text-success" : "text-destructive"
            }`}
          >
            {isPositive ? "+" : ""}
            {change}%
          </span>
          <span className="text-xs text-muted-foreground">{changeLabel}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Simple bar chart component.
 */
function SimpleBarChart({ data }: { data: Array<{ label: string; value: number; color: string }> }) {
  const maxValue = Math.max(...data.map((d) => d.value));

  return (
    <div className="space-y-3">
      {data.map((item, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-medium">{item.value}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${item.color} rounded-full transition-all duration-500`}
              style={{ width: `${(item.value / maxValue) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Analytics Page.
 */
export default function AnalyticsPage() {
  // Mock data for charts
  const runsByDay = [
    { label: "Mon", value: 12, color: "bg-cyan-accent" },
    { label: "Tue", value: 18, color: "bg-cyan-accent" },
    { label: "Wed", value: 8, color: "bg-cyan-accent" },
    { label: "Thu", value: 24, color: "bg-cyan-accent" },
    { label: "Fri", value: 15, color: "bg-cyan-accent" },
    { label: "Sat", value: 6, color: "bg-cyan-accent" },
    { label: "Sun", value: 4, color: "bg-cyan-accent" },
  ];

  const spendingByTool = [
    { label: "News API", value: 15.2, color: "bg-payment" },
    { label: "Data Scraper", value: 12.8, color: "bg-payment" },
    { label: "Translation", value: 8.5, color: "bg-payment" },
    { label: "Weather API", value: 4.2, color: "bg-payment" },
    { label: "Other", value: 2.1, color: "bg-payment" },
  ];

  const topWorkflows = [
    { name: "News Summarization", runs: 45, success: 98, cost: "$11.25" },
    { name: "Competitor Analysis", runs: 32, success: 94, cost: "$8.40" },
    { name: "Content Generation", runs: 28, success: 96, cost: "$7.80" },
    { name: "Data Extraction", runs: 21, success: 85, cost: "$5.25" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
        <p className="text-muted-foreground">
          Track your workflow usage and spending patterns
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total Runs"
          value="128"
          change={12}
          changeLabel="vs last week"
          icon={Play}
          color="text-cyan-accent"
        />
        <StatCard
          title="Success Rate"
          value="94%"
          change={3}
          changeLabel="vs last week"
          icon={CheckCircle}
          color="text-success"
        />
        <StatCard
          title="Total Spent"
          value="$45.20"
          change={-8}
          changeLabel="vs last week"
          icon={DollarSign}
          color="text-payment"
        />
        <StatCard
          title="Avg Duration"
          value="2.4m"
          change={15}
          changeLabel="faster"
          icon={Zap}
          color="text-warning"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-6">
        {/* Runs by day */}
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Runs This Week</CardTitle>
            <CardDescription>Daily workflow execution count</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart data={runsByDay} />
          </CardContent>
        </Card>

        {/* Spending by tool */}
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Spending by Tool</CardTitle>
            <CardDescription>USDC spent per tool this month</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              data={spendingByTool.map((d) => ({
                ...d,
                value: d.value * 10, // Scale for visualization
                label: `${d.label} ($${d.value})`,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      {/* Top workflows */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Top Workflows</CardTitle>
          <CardDescription>Most frequently used workflow patterns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {topWorkflows.map((workflow, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-4 rounded-lg bg-muted/30"
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-accent/20 to-primary/20 flex items-center justify-center text-sm font-bold text-cyan-accent">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-medium">{workflow.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {workflow.runs} runs this month
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge
                    variant={workflow.success >= 95 ? "default" : "outline"}
                    className={
                      workflow.success >= 95
                        ? "bg-success/20 text-success border-success/30"
                        : ""
                    }
                  >
                    {workflow.success}% success
                  </Badge>
                  <span className="text-sm font-medium text-payment">
                    {workflow.cost}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Usage insights */}
      <div className="grid grid-cols-3 gap-6">
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Peak Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">10 AM - 2 PM</p>
            <p className="text-sm text-muted-foreground mt-1">
              Most workflows run during business hours
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              Avg Cost/Run
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-payment">$0.35</p>
            <p className="text-sm text-muted-foreground mt-1">
              Average spending per workflow execution
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-muted-foreground" />
              Steps/Run
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">4.2</p>
            <p className="text-sm text-muted-foreground mt-1">
              Average steps per workflow
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
