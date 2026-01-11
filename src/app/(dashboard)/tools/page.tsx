"use client";

/**
 * Tools Registry Page
 *
 * @description Lists available tools from both the x402 Bazaar and manual
 * registrations. Allows syncing from Bazaar and adding manual tools.
 *
 * @see https://docs.cdp.coinbase.com/x402/bazaar
 */

import { useState, useEffect, useCallback } from "react";
import {
  Wrench,
  Search,
  Plus,
  RefreshCw,
  ExternalLink,
  Star,
  Clock,
  DollarSign,
  Globe,
  CloudDownload,
  Trash2,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

/**
 * Tool item from API.
 */
type ToolItem = {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  source: "bazaar" | "manual";
  reputation: {
    successRate: number;
    avgLatencyMs: number;
    disputeRate: number;
    lastVerifiedAt?: string;
  };
  pricingHints?: {
    typicalAmountAtomic?: string;
    network?: string;
    asset?: string;
  };
  endpoints: Array<{
    path: string;
    method: string;
    description?: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

/**
 * Tool counts by source.
 */
type ToolCounts = {
  bazaar: number;
  manual: number;
  total: number;
};

// =============================================================================
// Component
// =============================================================================

/**
 * Tools Page.
 *
 * @description Main page for the Tool Registry, allowing users to browse,
 * sync, and manage x402-compatible tools.
 */
export default function ToolsPage() {
  // State
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [counts, setCounts] = useState<ToolCounts>({ bazaar: 0, manual: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "bazaar" | "manual">("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [newToolUrl, setNewToolUrl] = useState("");
  const [newToolName, setNewToolName] = useState("");
  const [newToolDescription, setNewToolDescription] = useState("");
  const [newToolEndpoint, setNewToolEndpoint] = useState("/");
  const [newToolMethod, setNewToolMethod] = useState<"GET" | "POST">("GET");
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncNetwork, setSyncNetwork] = useState<string>("all");

  /**
   * Fetch tools from the API.
   */
  const fetchTools = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) {
        params.set("search", searchQuery);
      }
      if (sourceFilter !== "all") {
        params.set("source", sourceFilter);
      }

      const response = await fetch(`/api/tools?${params.toString()}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch tools");
      }

      setTools(data.tools);
      setCounts(data.counts);
    } catch (error) {
      console.error("Failed to fetch tools:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load tools");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, sourceFilter]);

  // Fetch tools on mount and when filters change
  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  /**
   * Sync tools from x402 Bazaar.
   */
  const handleBazaarSync = async () => {
    setSyncing(true);
    try {
      const body: { action: string; network?: string } = { action: "sync" };
      if (syncNetwork !== "all") {
        body.network = syncNetwork;
      }

      const response = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Bazaar sync failed");
      }

      toast.success(
        `Synced ${data.synced} tools (${data.created} new, ${data.updated} updated)`
      );
      setSyncDialogOpen(false);
      fetchTools();
    } catch (error) {
      console.error("Bazaar sync error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to sync from Bazaar. The service may be unavailable."
      );
    } finally {
      setSyncing(false);
    }
  };

  /**
   * Add a new manual tool.
   */
  const handleAddTool = async () => {
    if (!newToolUrl || !newToolName) {
      toast.error("Please provide a name and URL");
      return;
    }

    // Validate URL
    try {
      new URL(newToolUrl);
    } catch {
      toast.error("Please provide a valid URL");
      return;
    }

    setAdding(true);
    try {
      const response = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: newToolName,
          description: newToolDescription || `Manual tool: ${newToolName}`,
          baseUrl: newToolUrl,
          endpoints: [
            {
              path: newToolEndpoint || "/",
              method: newToolMethod,
              description: `${newToolMethod} endpoint`,
            },
          ],
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to add tool");
      }

      toast.success(`Tool "${newToolName}" added successfully!`);
      setAddDialogOpen(false);
      setNewToolUrl("");
      setNewToolName("");
      setNewToolDescription("");
      setNewToolEndpoint("/");
      setNewToolMethod("GET");
      fetchTools();
    } catch (error) {
      console.error("Add tool error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to add tool");
    } finally {
      setAdding(false);
    }
  };

  /**
   * Delete a tool.
   */
  const handleDeleteTool = async (tool: ToolItem) => {
    if (!confirm(`Delete tool "${tool.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/tools/${tool.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to delete tool");
      }

      toast.success(`Tool "${tool.name}" deleted`);
      fetchTools();
    } catch (error) {
      console.error("Delete tool error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete tool");
    }
  };

  /**
   * Format cost from atomic units.
   *
   * @param atomic - Amount in atomic units (6 decimals for USDC).
   * @returns Formatted cost string.
   */
  const formatCost = (atomic?: string): string => {
    if (!atomic || atomic === "0") return "Free";
    try {
      const usdc = Number(atomic) / 1_000_000;
      if (usdc < 0.01) {
        return `~$${usdc.toFixed(4)}`;
      }
      return `~$${usdc.toFixed(2)}`;
    } catch {
      return "Unknown";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tool Registry</h2>
          <p className="text-muted-foreground">
            Discover and manage x402-compatible tools for your workflows
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sync from Bazaar Button */}
          <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <CloudDownload className="w-4 h-4 mr-2" />
                Sync Bazaar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Sync from x402 Bazaar</DialogTitle>
                <DialogDescription>
                  Discover and import x402-compatible services from the Coinbase Bazaar.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="sync-network">Network Filter</Label>
                  <Select value={syncNetwork} onValueChange={setSyncNetwork}>
                    <SelectTrigger id="sync-network">
                      <SelectValue placeholder="All networks" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Networks</SelectItem>
                      <SelectItem value="eip155:8453">Base Mainnet</SelectItem>
                      <SelectItem value="eip155:84532">Base Sepolia (Testnet)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Filter services by the blockchain network they accept payments on.
                  </p>
                </div>
                <Button
                  onClick={handleBazaarSync}
                  disabled={syncing}
                  className="w-full bg-gradient-to-r from-cyan-accent to-primary hover:opacity-90"
                >
                  {syncing ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <CloudDownload className="w-4 h-4 mr-2" />
                      Sync from Bazaar
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Add Manual Tool Button */}
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-cyan-accent to-primary hover:opacity-90">
                <Plus className="w-4 h-4 mr-2" />
                Add Tool
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Manual Tool</DialogTitle>
                <DialogDescription>
                  Register a custom API tool for use in workflows
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="tool-name">Tool Name *</Label>
                  <Input
                    id="tool-name"
                    placeholder="My API Tool"
                    value={newToolName}
                    onChange={(e) => setNewToolName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tool-url">Base URL *</Label>
                  <Input
                    id="tool-url"
                    placeholder="https://api.example.com"
                    value={newToolUrl}
                    onChange={(e) => setNewToolUrl(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tool-endpoint">Endpoint Path</Label>
                    <Input
                      id="tool-endpoint"
                      placeholder="/api/data"
                      value={newToolEndpoint}
                      onChange={(e) => setNewToolEndpoint(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tool-method">Method</Label>
                    <Select
                      value={newToolMethod}
                      onValueChange={(v) => setNewToolMethod(v as "GET" | "POST")}
                    >
                      <SelectTrigger id="tool-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                        <SelectItem value="DELETE">DELETE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tool-description">Description</Label>
                  <Textarea
                    id="tool-description"
                    placeholder="What does this tool do?"
                    value={newToolDescription}
                    onChange={(e) => setNewToolDescription(e.target.value)}
                  />
                </div>
                <Button onClick={handleAddTool} disabled={adding} className="w-full">
                  {adding ? "Adding..." : "Add Tool"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-accent/10 flex items-center justify-center">
                <Globe className="w-5 h-5 text-cyan-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">{counts.total}</p>
                <p className="text-sm text-muted-foreground">Total Tools</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-payment/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-payment" />
              </div>
              <div>
                <p className="text-2xl font-bold">{counts.bazaar}</p>
                <p className="text-sm text-muted-foreground">From Bazaar</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Wrench className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{counts.manual}</p>
                <p className="text-sm text-muted-foreground">Manual</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-background/50"
              />
            </div>
            <Select
              value={sourceFilter}
              onValueChange={(v) => setSourceFilter(v as "all" | "bazaar" | "manual")}
            >
              <SelectTrigger className="w-40">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="bazaar">Bazaar Only</SelectItem>
                <SelectItem value="manual">Manual Only</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={fetchTools}
              disabled={loading}
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tools grid */}
      <div className="grid grid-cols-2 gap-4">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))
        ) : tools.length === 0 ? (
          <Card className="col-span-2 bg-card/50 backdrop-blur border-border/50">
            <CardContent className="py-12 text-center">
              <Wrench className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">No tools found</p>
              <p className="text-sm text-muted-foreground mb-4">
                Sync from the x402 Bazaar or add your own tools to get started.
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" onClick={() => setSyncDialogOpen(true)}>
                  <CloudDownload className="w-4 h-4 mr-2" />
                  Sync Bazaar
                </Button>
                <Button variant="outline" onClick={() => setAddDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Tool
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          tools.map((tool) => (
            <Card
              key={tool.id}
              className="bg-card/50 backdrop-blur border-border/50 hover:border-cyan-accent/50 transition-colors group"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Globe className="w-5 h-5 text-cyan-accent" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{tool.name}</CardTitle>
                      <Badge
                        variant={tool.source === "bazaar" ? "default" : "outline"}
                        className="mt-1 text-xs"
                      >
                        {tool.source === "bazaar" ? "x402 Bazaar" : "Manual"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" asChild>
                      <a
                        href={tool.baseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                      onClick={() => handleDeleteTool(tool)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <CardDescription className="mt-2 line-clamp-2">
                  {tool.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Star className="w-4 h-4 text-warning" />
                    <span>{(tool.reputation.successRate * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>{tool.reputation.avgLatencyMs.toFixed(0)}ms</span>
                  </div>
                  <div className="flex items-center gap-1 text-payment">
                    <DollarSign className="w-4 h-4" />
                    <span>{formatCost(tool.pricingHints?.typicalAmountAtomic)}</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tool.endpoints.slice(0, 3).map((ep, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {ep.method} {ep.path}
                    </Badge>
                  ))}
                  {tool.endpoints.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{tool.endpoints.length - 3} more
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
