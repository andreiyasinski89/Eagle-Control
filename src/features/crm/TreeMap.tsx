"use client";

import { memo, useMemo } from "react";
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, type Edge, type Node as RFNode, type NodeProps, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { Building2, CheckSquare, Folder, FolderKanban, Handshake, Layers, ListChecks, Network, Timer, User, UserCheck, Workflow } from "lucide-react";
import { DEFAULT_LAYOUT, tidyLayout } from "@/modules/nodes/layout";
import { cn } from "@/lib/utils";

export type TreeKind = "pipeline" | "stage" | "company" | "contact" | "deal" | "project" | "epic" | "sprint" | "task" | "subtask" | "doc" | "root" | "group" | "partner";

export interface TreeMapNode {
  id: string;
  parentId: string | null;
  position: number;
  kind: TreeKind;
  title: string;
  subtitle?: string;
  health?: "GREEN" | "YELLOW" | "RED" | null;
  progress?: number | null;
  /** The edge from the parent is a link, not parenthood (drawn dashed). */
  linked?: boolean;
  warning?: boolean;
  closed?: boolean;
  /** A colour for the left edge of the card (a funnel stage, a group); wins over the health colour. */
  accent?: string | null;
}

const ICON: Record<TreeKind, typeof User> = { pipeline: Workflow, stage: Layers, company: Building2, contact: User, deal: Handshake, project: FolderKanban, epic: Layers, sprint: Timer, task: CheckSquare, subtask: ListChecks, doc: CheckSquare, root: Network, group: Folder, partner: UserCheck };

interface CardData extends Record<string, unknown> {
  node: TreeMapNode;
  heatmap: boolean;
}
type CardNode = RFNode<CardData, "tree">;

const color = (h?: string | null) => (h ? `var(--health-${h.toLowerCase()})` : "var(--border)");

const Card = memo(function Card({ data }: NodeProps<CardNode>) {
  const { node, heatmap } = data;
  const Icon = ICON[node.kind];
  const tint = heatmap && node.health && !node.closed;
  return (
    <div
      data-testid={`tree-${node.id}`}
      data-kind={node.kind}
      data-health={node.health ?? ""}
      className={cn("h-[76px] w-[240px] cursor-pointer rounded-lg border border-border bg-card px-3 py-2 shadow-sm hover:border-primary", node.closed && "opacity-70")}
      style={{ borderLeftWidth: 5, borderLeftColor: node.accent ?? color(node.closed ? null : node.health), background: tint ? `color-mix(in srgb, ${color(node.health)} 22%, var(--card))` : undefined }}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <div className="truncate text-sm font-medium">{node.title}</div>
        {node.warning && <span title="At risk" className="ml-auto text-[var(--health-red)]">⚠</span>}
      </div>
      {node.subtitle && <div className="mt-0.5 truncate text-xs text-muted-foreground">{node.subtitle}</div>}
      {typeof node.progress === "number" && (
        <div className="absolute inset-x-3 bottom-1.5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full" style={{ width: `${node.progress}%`, background: color(node.health) }} />
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </div>
  );
});

const nodeTypes: NodeTypes = { tree: Card };

function Inner({ nodes, heatmap, onOpen }: { nodes: TreeMapNode[]; heatmap: boolean; onOpen: (n: TreeMapNode) => void }) {
  const { resolvedTheme } = useTheme();
  const layout = useMemo(() => tidyLayout(nodes), [nodes]);
  const rf = useMemo<CardNode[]>(
    () => nodes.map((n) => ({ id: n.id, type: "tree", position: { x: layout.get(n.id)?.x ?? 0, y: layout.get(n.id)?.y ?? 0 }, data: { node: n, heatmap }, draggable: false, width: DEFAULT_LAYOUT.nodeWidth, height: DEFAULT_LAYOUT.nodeHeight })),
    [nodes, layout, heatmap],
  );
  const edges = useMemo<Edge[]>(
    () =>
      nodes
        .filter((n) => n.parentId && layout.has(n.parentId))
        .map((n) => ({
          id: `${n.parentId}-${n.id}`,
          source: n.parentId as string,
          target: n.id,
          type: "smoothstep",
          style: { stroke: heatmap && n.health ? color(n.health) : "var(--edge)", strokeWidth: heatmap ? 2.5 : 1.5, strokeDasharray: n.linked ? "6 4" : undefined },
        })),
    [nodes, layout, heatmap],
  );
  return (
    <ReactFlow<CardNode, Edge>
      nodes={rf}
      edges={edges}
      nodeTypes={nodeTypes}
      colorMode={resolvedTheme === "dark" ? "dark" : "light"}
      nodesDraggable={false}
      nodesConnectable={false}
      onNodeClick={(_, n) => onOpen(n.data.node)}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      minZoom={0.1}
      maxZoom={1.6}
      onlyRenderVisibleElements
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} size={1} />
      <Controls showInteractive={false} position="bottom-left" />
      <MiniMap pannable zoomable position="bottom-right" nodeColor={(n) => color((n as CardNode).data.node.health)} />
    </ReactFlow>
  );
}

/** Read-only tree for CRM views (Client Map, pipeline map). Same layout and health colours as the project map. */
export function TreeMap(props: { nodes: TreeMapNode[]; heatmap: boolean; onOpen: (n: TreeMapNode) => void }) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
