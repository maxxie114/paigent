"use client";

/**
 * New Run Page
 *
 * @description Create a new workflow run with voice or text input.
 * Automatically fetches the user's default workspace on mount.
 */

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { IntentInput } from "@/components/runs/intent-input";
import { RunGraphVisualization } from "@/components/runs/run-graph";
import { toast } from "sonner";
import type { RunGraph } from "@/types/graph";

/**
 * Workspace data returned from the API.
 */
type WorkspaceData = {
  id: string;
  name: string;
  settings: {
    autoPayEnabled: boolean;
    autoPayMaxPerStepAtomic: string;
    autoPayMaxPerRunAtomic: string;
    toolAllowlist: string[];
  };
  createdAt: string;
};

/**
 * New Run Page.
 */
export default function NewRunPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined);
  const [workspaceError, setWorkspaceError] = useState<string | undefined>(undefined);
  const [generatedGraph, setGeneratedGraph] = useState<RunGraph | null>(null);
  const [autoPayEnabled, setAutoPayEnabled] = useState(true);
  const [budget, setBudget] = useState([5]); // $5 USDC default

  /**
   * Fetch the user's default workspace on mount.
   */
  useEffect(() => {
    async function fetchWorkspace() {
      try {
        setIsLoadingWorkspace(true);
        setWorkspaceError(undefined);

        const res = await fetch("/api/workspaces");
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to fetch workspace");
        }

        const workspaces: WorkspaceData[] = data.data.workspaces;
        if (workspaces.length === 0) {
          throw new Error("No workspace found. Please refresh the page.");
        }

        // Use the first workspace (default workspace)
        setWorkspaceId(workspaces[0].id);

        // Optionally sync auto-pay setting from workspace settings
        setAutoPayEnabled(workspaces[0].settings.autoPayEnabled);
      } catch (error) {
        console.error("Error fetching workspace:", error);
        setWorkspaceError(
          error instanceof Error ? error.message : "Failed to fetch workspace"
        );
        toast.error("Failed to load workspace. Please refresh the page.");
      } finally {
        setIsLoadingWorkspace(false);
      }
    }

    fetchWorkspace();
  }, []);

  /**
   * Handle intent submission.
   */
  const handleSubmit = useCallback(
    async (intent: string, voiceTranscript?: string) => {
      // Ensure workspace is loaded before proceeding
      if (!workspaceId) {
        toast.error("Workspace not loaded. Please refresh the page.");
        return;
      }

      setIsCreating(true);
      setGeneratedGraph(null);

      try {
        // Create run via API
        const res = await fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            intent,
            voiceTranscript,
            budgetMaxAtomic: (budget[0] * 1_000_000).toString(),
          }),
        });

        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to create run");
        }

        // Check if planning failed
        const planningFailed = data.data.planning?.success === false;
        
        // Show generated graph (even for fallback graph)
        if (data.data.graph) {
          setGeneratedGraph(data.data.graph);
          
          if (planningFailed) {
            // Planning failed - show error and still navigate to see details
            toast.error(
              data.data.planning?.error || 
              "Workflow planning failed. Please try rephrasing your request.",
              { duration: 5000 }
            );
          } else {
            toast.success("Workflow planned successfully!");
          }
        }

        // Navigate to run detail page after a delay (shorter for errors)
        setTimeout(() => {
          router.push(`/runs/${data.data.runId}`);
        }, planningFailed ? 1000 : 2000);
      } catch (error) {
        console.error("Error creating run:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to create workflow"
        );
      } finally {
        setIsCreating(false);
      }
    },
    [router, budget, workspaceId]
  );

  // Show loading state while workspace is being fetched
  if (isLoadingWorkspace) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <Loader2 className="w-12 h-12 animate-spin text-cyan-accent mb-4" />
        <p className="text-muted-foreground">Loading workspace...</p>
      </div>
    );
  }

  // Show error state if workspace failed to load
  if (workspaceError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <div className="text-destructive text-lg">Failed to load workspace</div>
        <p className="text-muted-foreground">{workspaceError}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/runs">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">New Workflow</h2>
          <p className="text-muted-foreground">
            Describe what you want to accomplish and we&apos;ll plan it for you
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main input area */}
        <div className="col-span-2 space-y-6">
          {/* Intent input */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cyan-accent" />
                <CardTitle>What do you want to accomplish?</CardTitle>
              </div>
              <CardDescription>
                Use voice or text to describe your goal. Our AI will plan the
                workflow for you.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IntentInput
                onSubmit={handleSubmit}
                isLoading={isCreating}
                disabled={!workspaceId}
                placeholder="Example: Summarize the top 5 news articles about AI from today, then generate a tweet thread about the key insights..."
              />
            </CardContent>
          </Card>

          {/* Generated graph preview */}
          {(generatedGraph || isCreating) && (
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>
                  {isCreating ? "Planning workflow..." : "Workflow Plan"}
                </CardTitle>
                <CardDescription>
                  {isCreating
                    ? "Our AI is designing the optimal workflow for your request"
                    : `${generatedGraph?.nodes.length || 0} steps planned`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isCreating ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="w-12 h-12 animate-spin text-cyan-accent mb-4" />
                    <p className="text-muted-foreground">
                      Analyzing your request...
                    </p>
                  </div>
                ) : generatedGraph ? (
                  <RunGraphVisualization
                    graph={generatedGraph}
                    readOnly
                  />
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Settings sidebar */}
        <div className="space-y-6">
          {/* Budget settings */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Budget</CardTitle>
              <CardDescription>
                Maximum amount to spend on this workflow
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Max Budget</Label>
                  <span className="text-xl font-bold text-payment">
                    ${budget[0].toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={budget}
                  onValueChange={setBudget}
                  max={50}
                  min={0.5}
                  step={0.5}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Workflow will pause for approval if a tool exceeds this budget
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-pay</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically approve small payments
                  </p>
                </div>
                <Switch
                  checked={autoPayEnabled}
                  onCheckedChange={setAutoPayEnabled}
                />
              </div>
            </CardContent>
          </Card>

          {/* Quick tips */}
          <Card className="bg-card/50 backdrop-blur border-cyan-accent/20">
            <CardHeader>
              <CardTitle className="text-base">💡 Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>• Be specific about what you want to achieve</p>
              <p>• Mention sources or tools if you have preferences</p>
              <p>• Include constraints like timeframes or formats</p>
              <p>• Voice input is great for complex requests</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
