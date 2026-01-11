"use client";

/**
 * Run Detail Page
 *
 * @description Shows workflow run details with real-time updates via SSE.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Play,
  XCircle,
  CheckCircle,
  RefreshCw,
  Clock,
  DollarSign,
  AlertTriangle,
  Loader2,
  Zap,
  Copy,
  Check,
  FileText,
  ChevronDown,
  ChevronRight,
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
import type { RunGraph } from "@/types/graph";
import type { StepStatus } from "@/types/database";
import type { SSEEventData } from "@/types/api";

/**
 * Step output viewer props.
 */
type StepOutputViewerProps = {
  step?: {
    stepId: string;
    status: StepStatus;
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    error?: { code?: string; message?: string };
    metrics?: { latencyMs?: number; costAtomic?: string; tokensUsed?: number };
  };
};

/**
 * Step Output Viewer Component.
 *
 * @description Displays the input and output of a workflow step in a readable format.
 * Handles both text and JSON outputs with proper formatting and copy functionality.
 */
function StepOutputViewer({ step }: StepOutputViewerProps) {
  const [copied, setCopied] = React.useState(false);
  const [showInputs, setShowInputs] = React.useState(false);

  if (!step) {
    return null;
  }

  /**
   * Format output for display.
   * Handles strings, objects, and nested structures.
   */
  const formatOutput = (data: unknown): string => {
    if (data === null || data === undefined) {
      return "No output";
    }
    if (typeof data === "string") {
      return data;
    }
    return JSON.stringify(data, null, 2);
  };

  /**
   * Get the primary output text.
   * Extracts the main content from various output formats.
   */
  const getOutputText = (): string => {
    if (!step.outputs) {
      if (step.error) {
        return `Error: ${step.error.message || "Unknown error"}`;
      }
      return step.status === "running" ? "Step is currently executing..." : "No output yet";
    }

    // Handle common output formats
    if (typeof step.outputs === "string") {
      return step.outputs;
    }

    // Check for common output keys
    const output = step.outputs as Record<string, unknown>;
    if (output.output && typeof output.output === "string") {
      return output.output;
    }
    if (output.result && typeof output.result === "string") {
      return output.result;
    }
    if (output.text && typeof output.text === "string") {
      return output.text;
    }

    // Fall back to formatted JSON
    return formatOutput(step.outputs);
  };

  const outputText = getOutputText();

  /**
   * Copy output to clipboard.
   */
  const handleCopy = async () => {
    await navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Metrics Summary */}
      {step.metrics && (
        <div className="flex flex-wrap gap-3 text-xs">
          {step.metrics.latencyMs && (
            <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded-md">
              <Clock className="w-3 h-3" />
              <span>{step.metrics.latencyMs}ms</span>
            </div>
          )}
          {step.metrics.tokensUsed && (
            <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded-md">
              <FileText className="w-3 h-3" />
              <span>{step.metrics.tokensUsed} tokens</span>
            </div>
          )}
          {step.metrics.costAtomic && (
            <div className="flex items-center gap-1 px-2 py-1 bg-payment/10 text-payment rounded-md">
              <DollarSign className="w-3 h-3" />
              <span>${(Number(step.metrics.costAtomic) / 1_000_000).toFixed(4)}</span>
            </div>
          )}
        </div>
      )}

      {/* Inputs Section (Collapsible) */}
      {step.inputs && Object.keys(step.inputs).length > 0 && (
        <div className="border border-border/50 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowInputs(!showInputs)}
            className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <span className="text-sm font-medium text-muted-foreground">Inputs</span>
            {showInputs ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {showInputs && (
            <div className="p-3 bg-muted/10">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono overflow-auto max-h-40">
                {formatOutput(step.inputs)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {step.error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
          <p className="text-sm font-medium text-destructive mb-1">
            {step.error.code || "Error"}
          </p>
          <p className="text-sm text-destructive/80">{step.error.message}</p>
        </div>
      )}

      {/* Output Display */}
      <div className="relative">
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={handleCopy}
            className="p-1.5 bg-muted/80 hover:bg-muted rounded-md transition-colors"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="w-4 h-4 text-success" />
            ) : (
              <Copy className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </div>
        <ScrollArea className="h-[400px]">
          <div className="p-4 bg-muted/20 rounded-lg border border-border/50">
            <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed">
              {outputText}
            </pre>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

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
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    error?: { code?: string; message?: string };
    metrics?: { latencyMs?: number; costAtomic?: string; tokensUsed?: number };
  }>;
  createdAt: string;
};

/**
 * Run Detail Page.
 *
 * @description Displays workflow run details with real-time SSE updates.
 * Uses memoized callbacks to prevent infinite re-render loops with useRunEvents.
 */
export default function RunDetailPage() {
  const params = useParams();
  const runId = params.runId as string;

  const [run, setRun] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  
  /**
   * Ref to track if initial fetch has completed.
   * Prevents duplicate fetches during SSE event handling.
   */
  const initialFetchComplete = useRef(false);

  /**
   * Fetch run data from the API.
   *
   * @description Retrieves the current run state including graph, steps, and budget.
   * Uses atomic state updates to prevent race conditions.
   */
  const fetchRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      const data = await res.json();

      if (data.success) {
        setRun(data.data);
      } else {
        // Only show error toast if we have meaningful error info
        if (data.error && data.error !== "Run not found") {
          toast.error(data.error);
        }
      }
    } catch (error) {
      console.error("Error fetching run:", error);
      // Only show toast on actual fetch errors, not during initial load
      if (initialFetchComplete.current) {
        toast.error("Failed to load run details");
      }
    } finally {
      setLoading(false);
      initialFetchComplete.current = true;
    }
  }, [runId]);

  /**
   * Memoized callback for handling SSE events.
   *
   * @description Triggered when step-related events are received.
   * Refreshes run data to get the latest step states.
   *
   * @param event - The SSE event data containing event type and payload.
   */
  const handleEvent = useCallback((event: SSEEventData) => {
    // Update run state based on event type
    if (event.type.startsWith("STEP_")) {
      // Use setTimeout to ensure we're not calling setState during render
      setTimeout(() => {
        fetchRun();
      }, 0);
    }
  }, [fetchRun]);

  /**
   * Memoized callback for handling run completion.
   *
   * @description Triggered when the workflow run completes (success or failure).
   * Shows a toast notification and refreshes the run data.
   *
   * @param status - The final status of the run (e.g., "succeeded", "failed").
   */
  const handleComplete = useCallback((status: string) => {
    // Use setTimeout to ensure toast is called outside of render phase
    setTimeout(() => {
      toast.success(`Workflow ${status}!`);
      fetchRun();
    }, 0);
  }, [fetchRun]);

  // Subscribe to real-time events with memoized callbacks
  const { events, connected } = useRunEvents(runId, {
    enabled: !!runId && !loading,
    onEvent: handleEvent,
    onComplete: handleComplete,
  });

  /**
   * Initial data fetch on mount.
   */
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
    } catch {
      toast.error(`Failed to ${action} run`);
    }
  };

  /**
   * Execute queued steps in the workflow.
   *
   * @description Triggers step execution via the execute API endpoint.
   * Will continue executing until all steps are complete or blocked.
   */
  const handleExecute = async () => {
    setExecuting(true);
    let totalExecuted = 0;
    let continueExecuting = true;

    try {
      // Keep executing until no more steps can be processed
      while (continueExecuting) {
        const res = await fetch(`/api/runs/${runId}/execute`, {
          method: "POST",
        });
        const data = await res.json();

        if (!data.success) {
          toast.error(data.error || "Failed to execute workflow");
          break;
        }

        totalExecuted += data.claimed || 0;

        // Refresh run data after each batch
        await fetchRun();

        // Stop if no steps were claimed (all done or blocked)
        if (data.claimed === 0) {
          continueExecuting = false;
        }

        // Small delay between batches to allow UI updates
        if (continueExecuting) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      if (totalExecuted > 0) {
        toast.success(`Executed ${totalExecuted} step(s)`);
      } else {
        toast.info("No queued steps to execute");
      }
    } catch {
      toast.error("Failed to execute workflow");
    } finally {
      setExecuting(false);
      fetchRun();
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
  
  // Check if there are executable steps (queued or blocked)
  const hasExecutableSteps = run.steps.some(
    (s) => s.status === "queued" || s.status === "blocked"
  );
  const isTerminalState = ["succeeded", "failed", "canceled"].includes(run.status);
  const canExecute = hasExecutableSteps && !isTerminalState;

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
          {canExecute && (
            <Button
              onClick={handleExecute}
              disabled={executing}
              className="bg-gradient-to-r from-cyan-accent to-primary hover:from-cyan-accent/90 hover:to-primary/90 text-primary-foreground font-semibold"
            >
              {executing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Execute Workflow
                </>
              )}
            </Button>
          )}
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Steps List */}
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>Step Details</CardTitle>
                <CardDescription>
                  Click a step to view its output
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
                          "flex items-center justify-between p-4 rounded-lg bg-muted/30 cursor-pointer transition-all hover:bg-muted/50",
                          selectedStep === step.stepId && "ring-2 ring-primary bg-muted/50"
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
                          {step.metrics?.tokensUsed && (
                            <span className="text-xs text-muted-foreground">
                              {step.metrics.tokensUsed} tokens
                            </span>
                          )}
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

            {/* Step Output Viewer */}
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>
                  {selectedStep
                    ? run.graph.nodes.find((n) => n.id === selectedStep)?.label || selectedStep
                    : "Step Output"}
                </CardTitle>
                <CardDescription>
                  {selectedStep ? "Output from selected step" : "Select a step to view its output"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedStep ? (
                  <StepOutputViewer
                    step={run.steps.find((s) => s.stepId === selectedStep)}
                  />
                ) : (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <p className="text-sm">Select a step from the list to view its output</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
