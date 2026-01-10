"use client";

/**
 * Runs List Page
 *
 * @description Lists all workflow runs with filtering and pagination.
 * Fetches runs from MongoDB via the API with workspace-level access control.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Play, Search, Filter, RefreshCw, Eye, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Status configuration for display styling.
 */
const STATUS_CONFIG: Record<
  string,
  { variant: "default" | "secondary" | "destructive" | "outline"; label: string; color: string }
> = {
  draft: { variant: "outline", label: "Draft", color: "text-muted-foreground" },
  queued: { variant: "secondary", label: "Queued", color: "text-muted-foreground" },
  running: { variant: "secondary", label: "Running", color: "text-cyan-accent" },
  paused_for_approval: { variant: "outline", label: "Needs Approval", color: "text-warning" },
  succeeded: { variant: "default", label: "Completed", color: "text-success" },
  failed: { variant: "destructive", label: "Failed", color: "text-destructive" },
  canceled: { variant: "outline", label: "Canceled", color: "text-muted-foreground" },
};

/**
 * Run item type for display.
 */
type RunItem = {
  id: string;
  intent: string;
  status: string;
  cost: string;
  createdAt: string;
  duration?: string;
};

/**
 * Runs List Page.
 *
 * @description Displays a paginated, filterable list of workflow runs.
 * Automatically fetches the user's default workspace and loads runs from MongoDB.
 */
export default function RunsPage() {
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [_loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  /**
   * Fetch the user's default workspace on mount.
   */
  useEffect(() => {
    async function fetchWorkspace() {
      try {
        setLoadingWorkspace(true);
        const res = await fetch("/api/workspaces");
        const data = await res.json();

        if (!data.success || !data.data?.workspaces?.length) {
          throw new Error(data.error || "No workspace found");
        }

        // Use the first workspace (default workspace)
        setWorkspaceId(data.data.workspaces[0].id);
      } catch (error) {
        console.error("Error fetching workspace:", error);
        toast.error("Failed to load workspace. Please refresh the page.");
      } finally {
        setLoadingWorkspace(false);
      }
    }

    fetchWorkspace();
  }, []);

  /**
   * Fetch runs from the API.
   *
   * @description Fetches workflow runs from MongoDB via the API.
   * Requires workspaceId to be loaded first.
   * Supports filtering by status and search query, with pagination.
   */
  const fetchRuns = useCallback(async () => {
    // Wait for workspace to be loaded
    if (!workspaceId) {
      return;
    }

    setLoading(true);
    try {
      // Build query params
      const params = new URLSearchParams();
      params.set("workspaceId", workspaceId);
      params.set("page", page.toString());
      params.set("pageSize", "20");
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      const res = await fetch(`/api/runs?${params.toString()}`);
      const data = await res.json();

      if (data.success && data.data?.runs) {
        // Map API response to RunItem format
        const mappedRuns: RunItem[] = data.data.runs.map((run: {
          id: string;
          status: string;
          input: { text: string };
          budget: { spentAtomic: string; maxAtomic: string };
          createdAt: string;
          updatedAt?: string;
        }) => {
          // Calculate cost from atomic units (USDC has 6 decimals)
          const spentUsdc = Number(run.budget.spentAtomic) / 1_000_000;
          
          // Calculate duration if run has completed (rough estimate from timestamps)
          let duration: string | undefined;
          if (run.updatedAt && (run.status === "succeeded" || run.status === "failed")) {
            const startMs = new Date(run.createdAt).getTime();
            const endMs = new Date(run.updatedAt).getTime();
            const durationMs = endMs - startMs;
            if (durationMs > 0) {
              if (durationMs < 60000) {
                duration = `${Math.round(durationMs / 1000)}s`;
              } else {
                const mins = Math.floor(durationMs / 60000);
                const secs = Math.round((durationMs % 60000) / 1000);
                duration = `${mins}m ${secs}s`;
              }
            }
          }

          return {
            id: run.id,
            intent: run.input.text,
            status: run.status,
            cost: `$${spentUsdc.toFixed(2)}`,
            createdAt: run.createdAt,
            duration,
          };
        });

        // Filter by search query (client-side for simplicity)
        let filtered = mappedRuns;
        if (searchQuery) {
          filtered = filtered.filter((r) =>
            r.intent.toLowerCase().includes(searchQuery.toLowerCase())
          );
        }

        setRuns(filtered);
        setHasMore(data.data.hasMore ?? false);
      } else {
        // API error - show empty state
        console.error("Failed to fetch runs:", data.error);
        setRuns([]);
        setHasMore(false);
      }
    } catch (error) {
      console.error("Failed to fetch runs:", error);
      setRuns([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, page, statusFilter, searchQuery]);

  /**
   * Fetch runs when workspace is loaded or filters change.
   */
  useEffect(() => {
    if (workspaceId) {
      fetchRuns();
    }
  }, [workspaceId, fetchRuns]);

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Workflow Runs</h2>
          <p className="text-muted-foreground">
            View and manage your workflow executions
          </p>
        </div>
        <Link href="/runs/new">
          <Button className="bg-gradient-to-r from-cyan-accent to-primary hover:opacity-90">
            <Play className="w-4 h-4 mr-2" />
            New Run
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search runs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-background/50"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 bg-background/50">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="paused_for_approval">Needs Approval</SelectItem>
                <SelectItem value="succeeded">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              onClick={fetchRuns}
              disabled={loading}
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Runs table */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[400px]">Intent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-64" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-12" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8 ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <p className="text-muted-foreground">No runs found</p>
                  <Link href="/runs/new">
                    <Button variant="outline" className="mt-4">
                      Create your first run
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ) : (
              runs.map((run) => {
                const statusInfo = STATUS_CONFIG[run.status] || STATUS_CONFIG.draft;

                return (
                  <TableRow key={run.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium">
                      <div className="max-w-[400px] truncate">{run.intent}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {run.status === "running" && (
                          <Loader2 className="w-3 h-3 animate-spin text-cyan-accent" />
                        )}
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-payment">{run.cost}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {run.duration || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(run.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/runs/${run.id}`}>
                        <Button variant="ghost" size="icon">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {!loading && runs.length > 0 && (
          <div className="flex items-center justify-between p-4 border-t border-border/50">
            <p className="text-sm text-muted-foreground">
              Showing {runs.length} runs
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
