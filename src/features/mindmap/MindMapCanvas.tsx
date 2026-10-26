"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import type { NodeType } from "@prisma/client";
import { DEFAULT_LAYOUT, tidyLayout } from "@/modules/nodes/layout";
import { allowedChildTypes } from "@/modules/nodes/node-rules";
import { archiveNode, createChild, moveDenial, moveNode, redo, undo, updateNode } from "./actions";
import { api } from "./api";
import { CanvasPresence } from "@/features/realtime/CanvasPresence";
import { NodeCard, type CardData, type CardNode } from "./NodeCard";
import { SearchPalette } from "./SearchPalette";
import { useMapStore } from "./store";
import { Toolbar } from "./Toolbar";
import { useSelection } from "./useSelection";
import { buildVisibility } from "./visibility";

const nodeTypes: NodeTypes = { card: NodeCard };

/** What Tab creates under a node of the given type. */
const DEFAULT_CHILD: Partial<Record<NodeType, NodeType>> = { PROJECT: "EPIC", EPIC: "SPRINT", SPRINT: "TASK", TASK: "SUBTASK" };

export interface TagDto {
  id: string;
  name: string;
  color: string;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

function Inner({ rootId }: { rootId: string }) {
  const t = useTranslations("map");
  const flow = useReactFlow<CardNode, Edge>();
  const { resolvedTheme } = useTheme();
  const { selectedId, select } = useSelection();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const nodes = useMapStore((s) => s.nodes);
  const people = useMapStore((s) => s.people);
  const heatmap = useMapStore((s) => s.heatmap);
  const filter = useMapStore((s) => s.filter);
  const filterMode = useMapStore((s) => s.filterMode);
  const focusId = useMapStore((s) => s.focusId);
  const role = useMapStore((s) => s.role);
  const workspaceId = useMapStore((s) => s.workspaceId);
  const canWrite = role !== "CLIENT";

  const { data: tagList } = useQuery({
    queryKey: ["tags", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => api.get<TagDto[]>(`/api/v1/workspaces/${workspaceId}/tags`),
  });
  const tagsById = useMemo(() => new Map((tagList ?? []).map((x) => [x.id, x])), [tagList]);

  const vis = useMemo(
    () => buildVisibility(Object.values(nodes), { rootId, focusId, filter, mode: filterMode, now: new Date() }),
    [nodes, rootId, focusId, filter, filterMode],
  );
  const layout = useMemo(() => tidyLayout(vis.visible), [vis.visible]);

  // Reuse unchanged React Flow node objects so memoised cards skip re-rendering.
  const cache = useRef(new Map<string, CardNode>());
  const layoutNodes = useMemo<CardNode[]>(() => {
    const next = new Map<string, CardNode>();
    const out = vis.visible.map((n) => {
      const pos = layout.get(n.id) ?? { x: 0, y: 0 };
      const dim = vis.matches !== null && !vis.matches.has(n.id);
      const assignee = n.assigneeId ? (people[n.assigneeId] ?? null) : null;
      const tags = n.tagIds.map((id) => tagsById.get(id)).filter((x): x is TagDto => !!x);
      const hasChildren = (vis.childrenOf.get(n.id)?.length ?? 0) > 0;
      const hiddenCount = vis.hiddenCounts.get(n.id) ?? 0;
      const prev = cache.current.get(n.id);
      const pd = prev?.data;
      if (
        prev &&
        pd &&
        pd.node === n &&
        prev.position.x === pos.x &&
        prev.position.y === pos.y &&
        pd.dim === dim &&
        pd.heatmap === heatmap &&
        pd.assignee === assignee &&
        pd.hiddenCount === hiddenCount &&
        pd.hasChildren === hasChildren &&
        pd.canWrite === canWrite &&
        pd.tags.length === tags.length &&
        pd.tags.every((x, i) => x === tags[i])
      ) {
        next.set(n.id, prev);
        return prev;
      }
      const data: CardData = {
        node: n,
        hiddenCount,
        hasChildren,
        dim,
        matched: vis.matches?.has(n.id) ?? false,
        heatmap,
        assignee,
        tags,
        canWrite,
      };
      const rf: CardNode = {
        id: n.id,
        type: "card",
        position: { x: pos.x, y: pos.y },
        data,
        draggable: canWrite && n.parentId !== null,
        width: DEFAULT_LAYOUT.nodeWidth,
        height: DEFAULT_LAYOUT.nodeHeight,
      };
      next.set(n.id, rf);
      return rf;
    });
    cache.current = next;
    return out;
  }, [vis, layout, people, tagsById, heatmap, canWrite]);

  const edges = useMemo<Edge[]>(
    () =>
      vis.visible
        .filter((n) => n.parentId && layout.has(n.parentId))
        .map((n) => {
          const color = n.healthOverride ?? n.health;
          return {
            id: `${n.parentId}-${n.id}`,
            source: n.parentId as string,
            target: n.id,
            type: "smoothstep",
            style: {
              stroke: heatmap && n.type !== "DOCUMENT" && n.type !== "EVENT" ? `var(--health-${color.toLowerCase()})` : "var(--edge)",
              strokeWidth: heatmap ? 2.5 : 1.5,
              opacity: vis.matches && !vis.matches.has(n.id) ? 0.2 : 1,
            },
          };
        }),
    [vis, layout, heatmap],
  );

  // Controlled nodes so dragging works; positions reset to the layout whenever it changes.
  const [rfNodes, setRfNodes] = useState<CardNode[]>(layoutNodes);
  useEffect(() => setRfNodes(layoutNodes.map((n) => ({ ...n, selected: n.id === selectedId }))), [layoutNodes, selectedId]);
  const onNodesChange = useCallback((changes: NodeChange<CardNode>[]) => {
    setRfNodes((cur) => applyNodeChanges(changes, cur));
  }, []);
  const snapBack = useCallback(() => setRfNodes(layoutNodes.map((n) => ({ ...n, selected: n.id === selectedId }))), [layoutNodes, selectedId]);

  // ── drag & drop ──────────────────────────────────────────────────────────
  /**
   * Drop target = the overlapped node whose centre is nearest, preferring one that may legally
   * receive the dragged node (and is not already its parent). Falls back to the nearest overlap
   * so the red "not allowed" hint still shows.
   */
  const targetUnder = useCallback(
    (dragged: CardNode): CardNode | null => {
      const cx = dragged.position.x + DEFAULT_LAYOUT.nodeWidth / 2;
      const cy = dragged.position.y + DEFAULT_LAYOUT.nodeHeight / 2;
      const dist = (n: CardNode) => Math.hypot(n.position.x + DEFAULT_LAYOUT.nodeWidth / 2 - cx, n.position.y + DEFAULT_LAYOUT.nodeHeight / 2 - cy);
      const parentId = useMapStore.getState().nodes[dragged.id]?.parentId;
      const hits = (flow.getIntersectingNodes(dragged) as CardNode[]).filter((n) => n.id !== dragged.id).sort((a, b) => dist(a) - dist(b));
      const valid = hits.find((h) => h.id !== parentId && moveDenial(dragged.id, h.id) === null);
      return valid ?? hits[0] ?? null;
    },
    [flow],
  );

  const onNodeDrag = useCallback(
    (_: unknown, dragged: CardNode) => {
      const target = targetUnder(dragged);
      if (!target) return useMapStore.getState().setDropHint(null);
      const reason = moveDenial(dragged.id, target.id);
      useMapStore.getState().setDropHint({ targetId: target.id, ok: reason === null, reason: reason ?? undefined });
    },
    [targetUnder],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, dragged: CardNode) => {
      const store = useMapStore.getState();
      store.setDropHint(null);
      const target = targetUnder(dragged);
      const node = store.nodes[dragged.id];
      if (!node?.parentId) return snapBack();

      if (target) {
        const reason = moveDenial(dragged.id, target.id);
        if (reason) {
          store.setNotice(t("cannotDrop", { reason: reason.replaceAll("_", " ") }));
          return snapBack();
        }
        if (target.id === node.parentId) return snapBack();
        snapBack();
        return void moveNode(dragged.id, target.id);
      }

      // Dropped in free space: reorder among current siblings by vertical position.
      const sibs = (vis.childrenOf.get(node.parentId) ?? []).filter((s) => s.id !== node.id);
      const centre = dragged.position.y;
      const idx = sibs.filter((s) => (layout.get(s.id)?.y ?? 0) < centre).length;
      const currentIdx = (vis.childrenOf.get(node.parentId) ?? []).findIndex((s) => s.id === node.id);
      snapBack();
      if (idx === currentIdx) return;
      const after = sibs[idx - 1];
      const before = sibs[idx];
      void moveNode(node.id, node.parentId, after ? { afterId: after.id } : { beforeId: before?.id ?? null });
    },
    [targetUnder, snapBack, vis.childrenOf, layout, t],
  );

  // ── keyboard ─────────────────────────────────────────────────────────────
  const addChildOf = useCallback(
    (id: string) => {
      const n = useMapStore.getState().nodes[id];
      const type = n && DEFAULT_CHILD[n.type];
      if (n && type && allowedChildTypes(n.type).includes(type)) void createChild(id, type, t(`new.${type}`)).then((nid) => nid && select(nid));
    },
    [select, t],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      // Only react when focus is on the map (or nowhere), never inside the drawer, dialogs or menus.
      const target = e.target as Node | null;
      if (target !== document.body && !(target && wrapRef.current?.contains(target))) return;
      const s = useMapStore.getState();
      const sel = selectedId ? s.nodes[selectedId] : undefined;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        return void (e.shiftKey ? redo() : undo());
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        return void redo();
      }
      if (!sel) return;
      const siblings = sel.parentId ? (vis.childrenOf.get(sel.parentId) ?? []) : [];
      const i = siblings.findIndex((x) => x.id === sel.id);

      switch (e.key) {
        case "Tab":
          e.preventDefault();
          if (canWrite) addChildOf(sel.id);
          break;
        case "Enter":
          e.preventDefault();
          if (canWrite && sel.parentId) void createChild(sel.parentId, sel.type, t(`new.${sel.type}`), { afterId: sel.id }).then((nid) => nid && select(nid));
          break;
        case "F2":
          e.preventDefault();
          if (canWrite) s.setEditing(sel.id);
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          if (canWrite) {
            const fallback = sel.parentId;
            void archiveNode(sel.id).then(() => select(fallback));
          }
          break;
        case "ArrowLeft":
          if (sel.parentId) select(sel.parentId);
          break;
        case "ArrowRight": {
          const first = vis.childrenOf.get(sel.id)?.[0];
          if (first && !sel.collapsed) select(first.id);
          else if (first) void updateNode(sel.id, { collapsed: false }, { record: false });
          break;
        }
        case "ArrowUp":
          e.preventDefault();
          if (siblings[i - 1]) select(siblings[i - 1]!.id);
          break;
        case "ArrowDown":
          e.preventDefault();
          if (siblings[i + 1]) select(siblings[i + 1]!.id);
          break;
        case "Escape":
          select(null);
          break;
      }
    },
    [selectedId, vis.childrenOf, canWrite, addChildOf, select, t],
  );

  // Window-level so shortcuts keep working after a card re-renders and drops focus.
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  // Ctrl+K works anywhere on the page, even outside the canvas.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Search / deep link: expand the path, then fly to the node.
  const flyTo = useCallback(
    (id: string) => {
      const s = useMapStore.getState();
      let cur = s.nodes[id]?.parentId ?? null;
      while (cur) {
        const p = s.nodes[cur];
        if (p?.collapsed) {
          s.patchLocal(p.id, { collapsed: false });
          void api.patch(`/api/v1/nodes/${p.id}`, { collapsed: false }).catch(() => undefined);
        }
        cur = p?.parentId ?? null;
      }
      if (s.focusId) s.setFocus(null);
      select(id);
      setTimeout(() => {
        const n = flow.getNode(id);
        if (n) void flow.setCenter(n.position.x + DEFAULT_LAYOUT.nodeWidth / 2, n.position.y + DEFAULT_LAYOUT.nodeHeight / 2, { zoom: 1, duration: 500 });
      }, 120);
    },
    [flow, select],
  );

  const editingId = useMapStore((s) => s.editingId);
  const centredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!editingId) {
      centredFor.current = null;
      return;
    }
    const n = rfNodes.find((x) => x.id === editingId);
    if (!n || centredFor.current === editingId) return;
    centredFor.current = editingId;
    void flow.setCenter(n.position.x + DEFAULT_LAYOUT.nodeWidth / 2, n.position.y + DEFAULT_LAYOUT.nodeHeight / 2, { zoom: Math.max(flow.getZoom(), 0.8), duration: 250 });
  }, [editingId, rfNodes, flow]);

  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && rfNodes.length > 0) {
      fitted.current = true;
      setTimeout(() => void flow.fitView({ padding: 0.2, duration: 0, maxZoom: 1 }), 0);
    }
  }, [rfNodes.length, flow]);

  return (
    <div ref={wrapRef} className="relative h-full w-full outline-none" tabIndex={0} data-testid="mindmap">
      <ReactFlow<CardNode, Edge>
        nodes={rfNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => {
          select(n.id);
          wrapRef.current?.focus();
        }}
        onPaneClick={() => {
          select(null);
          wrapRef.current?.focus();
        }}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        nodesConnectable={false}
        elementsSelectable
        selectNodesOnDrag={false}
        deleteKeyCode={null}
        disableKeyboardA11y
        onlyRenderVisibleElements
        minZoom={0.1}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
        zoomOnDoubleClick={false}
      >
        <Background gap={24} size={1} />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeColor={(n) => {
            const d = (n as CardNode).data;
            return `var(--health-${(d.node.healthOverride ?? d.node.health).toLowerCase()})`;
          }}
        />
        <CanvasPresence container={wrapRef} />
        <Toolbar
          rootId={rootId}
          selectedId={selectedId}
          onFit={() => void flow.fitView({ padding: 0.2, duration: 300, maxZoom: 1 })}
          onSearch={() => setSearchOpen(true)}
        />
      </ReactFlow>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} onPick={flyTo} />
      <FlyOnLoad flyTo={flyTo} selectedId={selectedId} ready={rfNodes.length > 0} />
    </div>
  );
}

/** A shared link with ?node=… should land on that node once. */
function FlyOnLoad({ flyTo, selectedId, ready }: { flyTo: (id: string) => void; selectedId: string | null; ready: boolean }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !ready || !selectedId) return;
    done.current = true;
    if (useMapStore.getState().nodes[selectedId]) flyTo(selectedId);
  }, [ready, selectedId, flyTo]);
  return null;
}

export function MindMapCanvas({ rootId }: { rootId: string }) {
  return (
    <ReactFlowProvider>
      <Inner rootId={rootId} />
    </ReactFlowProvider>
  );
}
