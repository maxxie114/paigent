"use client";

/**
 * Tools Registry Page
 *
 * @description Lists available tools and allows adding new ones.
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Tool item type.
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
  };
  pricingHints?: {
    typicalAmountAtomic: string;
  };
  endpoints: Array<{ path: string; method: string }>;
};

/**
 * Tools Page.
 */
export default function ToolsPage() {
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newToolUrl, setNewToolUrl] = useState("");
  const [newToolName, setNewToolName] = useState("");
  const [newToolDescription, setNewToolDescription] = useState("");
  const [adding, setAdding] = useState(false);

  // Fetch tools
  const fetchTools = useCallback(async () => {
    setLoading(true);
    try {
      // Mock data for now
      const mockTools: ToolItem[] = [
        {
          id: "1",
          name: "News API",
          description: "Fetch latest news articles from multiple sources worldwide",
          baseUrl: "https://newsapi.org",
          source: "bazaar",
          reputation: { successRate: 0.98, avgLatencyMs: 450 },
          pricingHints: { typicalAmountAtomic: "50000" },
          endpoints: [
            { path: "/v2/everything", method: "GET" },
            { path: "/v2/top-headlines", method: "GET" },
          ],
        },
        {
          id: "2",
          name: "Data Scraper",
          description: "Web scraping service for extracting structured data",
          baseUrl: "https://scraper.example.com",
          source: "bazaar",
          reputation: { successRate: 0.92, avgLatencyMs: 1200 },
          pricingHints: { typicalAmountAtomic: "100000" },
          endpoints: [
            { path: "/scrape", method: "POST" },
            { path: "/extract", method: "POST" },
          ],
        },
        {
          id: "3",
          name: "Weather API",
          description: "Real-time and forecast weather data for any location",
          baseUrl: "https://weather.example.com",
          source: "manual",
          reputation: { successRate: 0.99, avgLatencyMs: 200 },
          endpoints: [
            { path: "/current", method: "GET" },
            { path: "/forecast", method: "GET" },
          ],
        },
        {
          id: "4",
          name: "Translation Service",
          description: "Neural machine translation for 100+ languages",
          baseUrl: "https://translate.example.com",
          source: "bazaar",
          reputation: { successRate: 0.95, avgLatencyMs: 800 },
          pricingHints: { typicalAmountAtomic: "25000" },
          endpoints: [
            { path: "/translate", method: "POST" },
            { path: "/detect", method: "POST" },
          ],
        },
      ];

      // Filter by search
      const filtered = searchQuery
        ? mockTools.filter(
            (t) =>
              t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              t.description.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : mockTools;

      setTools(filtered);
    } catch (error) {
      console.error("Failed to fetch tools:", error);
      toast.error("Failed to load tools");
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  // Add new tool
  const handleAddTool = async () => {
    if (!newToolUrl || !newToolName) {
      toast.error("Please provide a name and URL");
      return;
    }

    setAdding(true);
    try {
      // In production, POST to /api/tools
      toast.success("Tool added successfully!");
      setAddDialogOpen(false);
      setNewToolUrl("");
      setNewToolName("");
      setNewToolDescription("");
      fetchTools();
    } catch {
      toast.error("Failed to add tool");
    } finally {
      setAdding(false);
    }
  };

  // Format cost
  const formatCost = (atomic?: string) => {
    if (!atomic) return "Free";
    const usdc = Number(atomic) / 1_000_000;
    return `~$${usdc.toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tool Registry</h2>
          <p className="text-muted-foreground">
            Discover and manage available tools for your workflows
          </p>
        </div>

        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-cyan-accent to-primary hover:opacity-90">
              <Plus className="w-4 h-4 mr-2" />
              Add Tool
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Tool</DialogTitle>
              <DialogDescription>
                Register a new API tool for use in workflows
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="tool-name">Tool Name</Label>
                <Input
                  id="tool-name"
                  placeholder="My API Tool"
                  value={newToolName}
                  onChange={(e) => setNewToolName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tool-url">Base URL</Label>
                <Input
                  id="tool-url"
                  placeholder="https://api.example.com"
                  value={newToolUrl}
                  onChange={(e) => setNewToolUrl(e.target.value)}
                />
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

      {/* Search */}
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
              <p className="text-muted-foreground">No tools found</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setAddDialogOpen(true)}
              >
                Add your first tool
              </Button>
            </CardContent>
          </Card>
        ) : (
          tools.map((tool) => (
            <Card
              key={tool.id}
              className="bg-card/50 backdrop-blur border-border/50 hover:border-cyan-accent/50 transition-colors"
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
                  <Button variant="ghost" size="icon" asChild>
                    <a
                      href={tool.baseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
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
                    <span>{tool.reputation.avgLatencyMs}ms</span>
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
