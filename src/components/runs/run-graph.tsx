"use client";

/**
 * Run Graph Visualization Component
 *
 * @description Renders the workflow graph using React Flow.
 * Displays nodes with status-based styling and animated edges.
 */

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  MarkerType,
  ConnectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { StepNode } from "./step-node";
import type { RunGraph, NodeType } from "@/types/graph";
import type { StepStatus } from "@/types/database";

/**
 * Props for the RunGraph component.
 */
export type RunGraphProps = {
  /** The workflow graph data. */
  graph: RunGraph;
  /** Step statuses keyed by step ID. */
  stepStatuses?: Record<string, StepStatus>;
  /** Step metrics keyed by step ID. */
  stepMetrics?: Record<string, { costAtomic?: string; latencyMs?: number }>;
  /** Currently selected node ID. */
  selectedNodeId?: string;
  /** Callback when a node is clicked. */
  onNodeClick?: (nodeId: string) => void;
  /** Callback when an approval action is taken. */
  onApprove?: (nodeId: string, approved: boolean) => void;
  /** Whether the graph is read-only. */
  readOnly?: boolean;
};

/**
 * Custom node types for React Flow.
 */
const nodeTypes = {
  stepNode: StepNode,
};

/**
 * Map node type to display configuration.
 */
const NODE_TYPE_CONFIG: Record<NodeType, { color: string; icon: string }> = {
  tool_call: { color: "cyan", icon: "Wrench" },
  llm_reason: { color: "purple", icon: "Brain" },
  approval: { color: "amber", icon: "ShieldCheck" },
  branch: { color: "blue", icon: "GitBranch" },
  wait: { color: "gray", icon: "Clock" },
  merge: { color: "blue", icon: "GitMerge" },
  finalize: { color: "green", icon: "CheckCircle" },
};

/**
 * Convert RunGraph to React Flow nodes.
 */
function graphToNodes(
  graph: RunGraph,
  stepStatuses: Record<string, StepStatus>,
  stepMetrics: Record<string, { costAtomic?: string; latencyMs?: number }>,
  selectedNodeId?: string
): Node[] {
  const nodes: Node[] = [];

  // Calculate positions using a simple layered layout
  const nodePositions = calculateNodePositions(graph);

  for (const node of graph.nodes) {
    const position = nodePositions.get(node.id) || { x: 0, y: 0 };
    const status = stepStatuses[node.id] || "queued";
    const metrics = stepMetrics[node.id];
    const config = NODE_TYPE_CONFIG[node.type];

    nodes.push({
      id: node.id,
      type: "stepNode",
      position,
      data: {
        label: node.label,
        nodeType: node.type,
        status,
        costAtomic: metrics?.costAtomic,
        latencyMs: metrics?.latencyMs,
        color: config.color,
        icon: config.icon,
        isSelected: node.id === selectedNodeId,
        requiresApproval: node.type === "approval",
      },
      selected: node.id === selectedNodeId,
    });
  }

  return nodes;
}

/**
 * Convert RunGraph to React Flow edges.
 */
function graphToEdges(
  graph: RunGraph,
  stepStatuses: Record<string, StepStatus>
): Edge[] {
  return graph.edges.map((edge, index) => {
    const sourceStatus = stepStatuses[edge.from] || "queued";
    const isActive =
      sourceStatus === "running" || sourceStatus === "succeeded";

    return {
      id: `edge-${index}`,
      source: edge.from,
      target: edge.to,
      type: "smoothstep",
      animated: sourceStatus === "running",
      style: {
        stroke: isActive
          ? "hsl(var(--primary))"
          : "hsl(var(--muted-foreground))",
        strokeWidth: isActive ? 2 : 1,
        opacity: isActive ? 1 : 0.5,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isActive
          ? "hsl(var(--primary))"
          : "hsl(var(--muted-foreground))",
      },
      label: edge.type === "failure" ? "on error" : edge.condition,
      labelStyle: {
        fill: "hsl(var(--muted-foreground))",
        fontSize: 10,
      },
    };
  });
}

/**
 * Calculate node positions using a simple layered layout.
 */
function calculateNodePositions(
  graph: RunGraph
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  // Build adjacency lists
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const node of graph.nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }

  for (const edge of graph.edges) {
    outgoing.get(edge.from)?.push(edge.to);
    incoming.get(edge.to)?.push(edge.from);
  }

  // Assign layers using BFS from entry node
  const layers = new Map<string, number>();
  const queue: string[] = [graph.entryNodeId];
  layers.set(graph.entryNodeId, 0);

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const currentLayer = layers.get(nodeId)!;

    for (const nextId of outgoing.get(nodeId) || []) {
      if (!layers.has(nextId)) {
        layers.set(nextId, currentLayer + 1);
        queue.push(nextId);
      }
    }
  }

  // Handle disconnected nodes
  for (const node of graph.nodes) {
    if (!layers.has(node.id)) {
      layers.set(node.id, 0);
    }
  }

  // Group nodes by layer
  const layerGroups = new Map<number, string[]>();
  for (const [nodeId, layer] of layers) {
    if (!layerGroups.has(layer)) {
      layerGroups.set(layer, []);
    }
    layerGroups.get(layer)!.push(nodeId);
  }

  // Position nodes
  const LAYER_HEIGHT = 150;
  const NODE_WIDTH = 250;
  const PADDING = 50;

  for (const [layer, nodeIds] of layerGroups) {
    const totalWidth = nodeIds.length * NODE_WIDTH + (nodeIds.length - 1) * PADDING;
    let startX = -totalWidth / 2;

    for (let i = 0; i < nodeIds.length; i++) {
      positions.set(nodeIds[i], {
        x: startX + i * (NODE_WIDTH + PADDING),
        y: layer * LAYER_HEIGHT,
      });
    }
  }

  return positions;
}

/**
 * Run Graph Visualization Component.
 *
 * @description Displays the workflow graph with interactive nodes
 * and animated edges showing execution progress.
 */
export function RunGraphVisualization({
  graph,
  stepStatuses = {},
  stepMetrics = {},
  selectedNodeId,
  onNodeClick,
  onApprove,
  readOnly = false,
}: RunGraphProps) {
  // Convert graph data to React Flow format
  const initialNodes = useMemo(
    () => graphToNodes(graph, stepStatuses, stepMetrics, selectedNodeId),
    [graph, stepStatuses, stepMetrics, selectedNodeId]
  );

  const initialEdges = useMemo(
    () => graphToEdges(graph, stepStatuses),
    [graph, stepStatuses]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when props change
  useMemo(() => {
    setNodes(graphToNodes(graph, stepStatuses, stepMetrics, selectedNodeId));
    setEdges(graphToEdges(graph, stepStatuses));
  }, [graph, stepStatuses, stepMetrics, selectedNodeId, setNodes, setEdges]);

  // Handle node click
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick?.(node.id);
    },
    [onNodeClick]
  );

  return (
    <div className="w-full h-full min-h-[500px] bg-background rounded-lg border border-border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{
          padding: 0.2,
          minZoom: 0.5,
          maxZoom: 1.5,
        }}
        minZoom={0.25}
        maxZoom={2}
        defaultEdgeOptions={{
          type: "smoothstep",
        }}
        proOptions={{
          hideAttribution: true,
        }}
      >
        <Controls
          showInteractive={false}
          className="bg-card border border-border rounded-lg"
        />
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="hsl(var(--muted-foreground) / 0.2)"
        />
      </ReactFlow>
    </div>
  );
}
