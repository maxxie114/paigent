"use client";

/**
 * Run Detail Page
 *
 * @description Shows workflow run details with real-time updates via SSE.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Play,
  Pause,
  XCircle,
  CheckCircle,
  RefreshCw,
  Clock,
  DollarSign,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { RunGraphVisualization } from "@/components/runs/run-graph";
import { useRunEvents } from "@/hooks/use-run-events";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { RunGraph, StepStatus } from "@/types/graph";

/**
 * Status configuration.
 */
const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  draft: { icon: Clock, color: "text-muted-foreground", label: "Draft" },
  queued: { icon: Clock, color: "text-muted-foreground", label: "Queued" },
  running: { icon: Loader2, color: "text-cyan-accent", label: "Running" },
  paused_for_approval: { icon: AlertTriangle, color: "text-warning", label: "Needs Approval" },
  succeeded: { icon: CheckCircle, color: "text-success", label: "Completed" },
  failed: { icon: XCircle, color: "text-destructive", label: "Failed" },
  canceled: { icon: XCircle, color: "text-muted-foreground", label: "Canceled" },
};

/**
 * Run data type.
 */
type RunData = {
  id: string;
  status: string;
  input: { text: string; voiceTranscript?: string };
  graph: RunGraph;
  budget: { maxAtomic: string; spentAtomic: string };
  steps: Array<{
    stepId: string;
    status: StepStatus;
    metrics?: { latencyMs?: number; costAtomic?: string };
  }>;
  createdAt: string;
};

/**
 * Run Detail Page.
 */
export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.runId as string;

  const [run, setRun] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);

  // Subscribe to real-time events
  const { events, connected, isComplete, error: sseError } = useRunEvents(runId, {
    enabled: !!runId && !loading,
    onEvent: (event) => {
      // Update run state based on event
      if (event.type.startsWith("STEP_")) {
        fetchRun(); // Refresh to get latest step states
      }
    },
    onComplete: (status) => {
      toast.success(`Workflow ${status}!`);
      fetchRun();
    },
  });

  // Fetch run data
  const fetchRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      const data = await res.json();

      if (data.success) {
        setRun(data.data);
      } else {
        toast.error(data.error || "Failed to load run");
      }
    } catch (error) {
      console.error("Error fetching run:", error);
      toast.error("Failed to load run details");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  // Build step statuses map
  const stepStatuses: Record<string, StepStatus> = {};
  const stepMetrics: Record<string, { latencyMs?: number; costAtomic?: string }> = {};

  run?.steps.forEach((step) => {
    stepStatuses[step.stepId] = step.status;
    if (step.metrics) {
      stepMetrics[step.stepId] = step.metrics;
    }
  });

  // Handle run actions
  const handleAction = async (action: "cancel" | "resume") => {
    try {
      const res = await fetch(`/api/runs/${runId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: action === "cancel" ? "canceled" : "running",
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(action === "cancel" ? "Run canceled" : "Run resumed");
        fetchRun();
      } else {
        toast.error(data.error || `Failed to ${action} run`);
      }
    } catch (error) {
      toast.error(`Failed to ${action} run`);
    }
  };

  // Format cost
  const formatCost = (atomic: string) => {
    const usdc = Number(atomic) / 1_000_000;
    return `$${usdc.toFixed(2)}`;
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-muted-foreground">Run not found</p>
        <Link href="/runs">
          <Button variant="outline" className="mt-4">
            Back to Runs
          </Button>
        </Link>
      </div>
    );
  }

  const statusInfo = STATUS_CONFIG[run.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusInfo.icon;
  const isActive = run.status === "running" || run.status === "queued";
  const canCancel = isActive || run.status === "paused_for_approval";
  const canResume = run.status === "paused_for_approval";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/runs">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight">Run Details</h2>
              <div className={cn("flex items-center gap-1", statusInfo.color)}>
                <StatusIcon
                  className={cn(
                    "w-4 h-4",
                    run.status === "running" && "animate-spin"
                  )}
                />
                <span className="text-sm font-medium">{statusInfo.label}</span>
              </div>
              {connected && isActive && (
                <Badge variant="outline" className="text-xs text-success">
                  ● Live
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 max-w-2xl truncate">
              {run.input.text}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canResume && (
            <Button
              variant="outline"
              onClick={() => handleAction("resume")}
            >
              <Play className="w-4 h-4 mr-2" />
              Resume
            </Button>
          )}
          {canCancel && (
            <Button
              variant="destructive"
              onClick={() => handleAction("cancel")}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={fetchRun}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs">Created</span>
            </div>
            <p className="font-medium">
              {new Date(run.createdAt).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Play className="w-4 h-4" />
              <span className="text-xs">Steps</span>
            </div>
            <p className="font-medium">
              {run.steps.filter((s) => s.status === "succeeded").length} /{" "}
              {run.steps.length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs">Spent</span>
            </div>
            <p className="font-medium text-payment">
              {formatCost(run.budget.spentAtomic)} / {formatCost(run.budget.maxAtomic)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs">Events</span>
            </div>
            <p className="font-medium">{events.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main content */}
      <Tabs defaultValue="graph" className="space-y-4">
        <TabsList>
          <TabsTrigger value="graph">Workflow Graph</TabsTrigger>
          <TabsTrigger value="events">Events ({events.length})</TabsTrigger>
          <TabsTrigger value="steps">Steps ({run.steps.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="graph">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardContent className="p-0">
              <RunGraphVisualization
                graph={run.graph}
                stepStatuses={stepStatuses}
                stepMetrics={stepMetrics}
                selectedNodeId={selectedStep || undefined}
                onNodeClick={setSelectedStep}
                readOnly
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle>Event Log</CardTitle>
              <CardDescription>
                Real-time events from this workflow run
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {events.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No events yet
                    </p>
                  ) : (
                    events.map((event, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 rounded-lg bg-muted/30"
                      >
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(event.ts).toLocaleTimeString()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{event.type}</p>
                          {event.data && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              {JSON.stringify(event.data).slice(0, 100)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="steps">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle>Step Details</CardTitle>
              <CardDescription>
                Individual step execution status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {run.steps.map((step) => {
                  const node = run.graph.nodes.find((n) => n.id === step.stepId);
                  const stepStatusInfo = STATUS_CONFIG[step.status] || STATUS_CONFIG.queued;

                  return (
                    <div
                      key={step.stepId}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-lg bg-muted/30",
                        selectedStep === step.stepId && "ring-2 ring-primary"
                      )}
                      onClick={() => setSelectedStep(step.stepId)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-md bg-muted", stepStatusInfo.color)}>
                          {React.createElement(stepStatusInfo.icon, {
                            className: cn(
                              "w-4 h-4",
                              step.status === "running" && "animate-spin"
                            ),
                          })}
                        </div>
                        <div>
                          <p className="font-medium">{node?.label || step.stepId}</p>
                          <p className="text-xs text-muted-foreground">
                            {node?.type.replace("_", " ")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {step.metrics?.latencyMs && (
                          <span className="text-xs text-muted-foreground">
                            {step.metrics.latencyMs}ms
                          </span>
                        )}
                        {step.metrics?.costAtomic && (
                          <span className="text-xs text-payment">
                            {formatCost(step.metrics.costAtomic)}
                          </span>
                        )}
                        <Badge variant={stepStatusInfo.color.includes("success") ? "default" : "outline"}>
                          {stepStatusInfo.label}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
