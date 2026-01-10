"use client";

/**
 * Step Node Component
 *
 * @description Custom React Flow node for displaying workflow steps.
 * Shows status, type icon, label, and payment information.
 */

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import {
  Wrench,
  Brain,
  ShieldCheck,
  GitBranch,
  Clock,
  GitMerge,
  CheckCircle,
  Loader2,
  AlertCircle,
  PauseCircle,
  DollarSign,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { NodeType } from "@/types/graph";
import type { StepStatus } from "@/types/database";

/**
 * Step node data interface.
 */
export type StepNodeData = {
  /** Human-readable label. */
  label: string;
  /** Node type. */
  nodeType: NodeType;
  /** Current execution status. */
  status: StepStatus;
  /** Cost in atomic USDC (if paid). */
  costAtomic?: string;
  /** Execution latency in milliseconds. */
  latencyMs?: number;
  /** Theme color. */
  color: string;
  /** Icon name. */
  icon: string;
  /** Whether this node is selected. */
  isSelected?: boolean;
  /** Whether this node requires approval. */
  requiresApproval?: boolean;
};

/**
 * Icon components mapped by name.
 */
const ICONS: Record<string, React.ElementType> = {
  Wrench,
  Brain,
  ShieldCheck,
  GitBranch,
  Clock,
  GitMerge,
  CheckCircle,
};

/**
 * Status configuration.
 */
const STATUS_CONFIG: Record<
  StepStatus,
  {
    bgClass: string;
    borderClass: string;
    textClass: string;
    icon: React.ElementType;
    label: string;
  }
> = {
  queued: {
    bgClass: "bg-muted/50",
    borderClass: "border-muted-foreground/30",
    textClass: "text-muted-foreground",
    icon: Clock,
    label: "Queued",
  },
  running: {
    bgClass: "bg-cyan-accent/10",
    borderClass: "border-cyan-accent",
    textClass: "text-cyan-accent",
    icon: Loader2,
    label: "Running",
  },
  succeeded: {
    bgClass: "bg-success/10",
    borderClass: "border-success",
    textClass: "text-success",
    icon: CheckCircle,
    label: "Completed",
  },
  failed: {
    bgClass: "bg-destructive/10",
    borderClass: "border-destructive",
    textClass: "text-destructive",
    icon: AlertCircle,
    label: "Failed",
  },
  blocked: {
    bgClass: "bg-warning/10",
    borderClass: "border-warning",
    textClass: "text-warning",
    icon: PauseCircle,
    label: "Awaiting Approval",
  },
};

/**
 * Format cost from atomic units to USDC.
 */
function formatCost(atomicAmount: string): string {
  const usdc = Number(atomicAmount) / 1_000_000;
  if (usdc < 0.01) {
    return `$${usdc.toFixed(6)}`;
  }
  return `$${usdc.toFixed(2)}`;
}

/**
 * Format latency to human-readable string.
 */
function formatLatency(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Step Node Component.
 *
 * @description Displays a workflow step node with status indicator,
 * type icon, and optional payment badge.
 */
export const StepNode = memo(function StepNode({
  data,
  selected,
}: NodeProps & { data: StepNodeData }) {
  const {
    label,
    nodeType,
    status,
    costAtomic,
    latencyMs,
    icon: iconName,
    isSelected,
  } = data;

  const statusConfig = STATUS_CONFIG[status];
  const Icon = ICONS[iconName] || Wrench;
  const StatusIcon = statusConfig.icon;

  return (
    <div
      className={cn(
        "relative px-4 py-3 min-w-[200px] max-w-[280px] rounded-lg border-2 transition-all duration-200",
        statusConfig.bgClass,
        statusConfig.borderClass,
        (selected || isSelected) && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        status === "running" && "animate-pulse"
      )}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-muted-foreground !border-background !w-3 !h-3"
      />

      {/* Header with icon and status */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "p-1.5 rounded-md",
              status === "succeeded"
                ? "bg-success/20"
                : status === "failed"
                ? "bg-destructive/20"
                : "bg-muted"
            )}
          >
            <Icon className="w-4 h-4 text-foreground" />
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {nodeType.replace("_", " ")}
          </span>
        </div>

        {/* Status indicator */}
        <div className={cn("flex items-center gap-1", statusConfig.textClass)}>
          <StatusIcon
            className={cn(
              "w-4 h-4",
              status === "running" && "animate-spin"
            )}
          />
        </div>
      </div>

      {/* Label */}
      <p className="text-sm font-medium text-foreground line-clamp-2">
        {label}
      </p>

      {/* Metrics row */}
      {(costAtomic || latencyMs) && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
          {costAtomic && (
            <Badge
              variant="outline"
              className="text-xs bg-payment/10 border-payment/30 text-payment"
            >
              <DollarSign className="w-3 h-3 mr-0.5" />
              {formatCost(costAtomic)}
            </Badge>
          )}
          {latencyMs && (
            <Badge
              variant="outline"
              className="text-xs bg-muted text-muted-foreground"
            >
              <Clock className="w-3 h-3 mr-0.5" />
              {formatLatency(latencyMs)}
            </Badge>
          )}
        </div>
      )}

      {/* Status badge for blocked state */}
      {status === "blocked" && (
        <div className="absolute -top-2 -right-2">
          <Badge className="bg-warning text-warning-foreground text-xs animate-pulse">
            Action Required
          </Badge>
        </div>
      )}

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-muted-foreground !border-background !w-3 !h-3"
      />
    </div>
  );
});
