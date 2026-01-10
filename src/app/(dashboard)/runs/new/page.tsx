"use client";

/**
 * New Run Page
 *
 * @description Create a new workflow run with voice or text input.
 */

import { useState, useCallback } from "react";
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
 * New Run Page.
 */
export default function NewRunPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [generatedGraph, setGeneratedGraph] = useState<RunGraph | null>(null);
  const [autoPayEnabled, setAutoPayEnabled] = useState(true);
  const [budget, setBudget] = useState([5]); // $5 USDC default

  /**
   * Handle intent submission.
   */
  const handleSubmit = useCallback(
    async (intent: string, voiceTranscript?: string) => {
      setIsCreating(true);
      setGeneratedGraph(null);

      try {
        // Create run via API
        const res = await fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: "default", // Would come from context in production
            intent,
            voiceTranscript,
            budgetMaxAtomic: (budget[0] * 1_000_000).toString(),
            autoPayEnabled,
          }),
        });

        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to create run");
        }

        // Show generated graph
        if (data.data.graph) {
          setGeneratedGraph(data.data.graph);
          toast.success("Workflow planned successfully!");
        }

        // Navigate to run detail page after a delay
        setTimeout(() => {
          router.push(`/runs/${data.data.runId}`);
        }, 2000);
      } catch (error) {
        console.error("Error creating run:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to create workflow"
        );
      } finally {
        setIsCreating(false);
      }
    },
    [router, budget, autoPayEnabled]
  );

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
