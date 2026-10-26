import { create } from "zustand";
import { EMPTY_FILTER, type FilterCriteria } from "@/modules/nodes/filters";
import { recomputeClient } from "./recompute";
import type { Change, ClientNode, Person, TreePayload } from "./types";
import type { FilterMode } from "./visibility";

export interface DropHint {
  targetId: string;
  ok: boolean;
  reason?: string;
}

interface MapState {
  projectId: string | null;
  workspaceId: string | null;
  projectData: Record<string, unknown>;
  role: TreePayload["role"];
  meId: string;
  nodes: Record<string, ClientNode>;
  people: Record<string, Person>;

  heatmap: boolean;
  filter: FilterCriteria;
  filterMode: FilterMode;
  focusId: string | null;
  editingId: string | null;
  dropHint: DropHint | null;
  notice: string | null;

  canUndo: boolean;
  canRedo: boolean;

  setTree: (payload: TreePayload) => void;
  /** Applies a fresh server snapshot but keeps the node being edited as the person has it. */
  mergeRemote: (payload: TreePayload) => void;
  upsert: (node: ClientNode) => void;
  patchLocal: (id: string, patch: Partial<ClientNode>) => void;
  removeIds: (ids: readonly string[]) => void;
  applyChanges: (changes: readonly Change[]) => void;
  recomputeLocal: () => void;

  setHeatmap: (on: boolean) => void;
  setFilter: (filter: FilterCriteria) => void;
  setFilterMode: (mode: FilterMode) => void;
  setFocus: (id: string | null) => void;
  setEditing: (id: string | null) => void;
  setDropHint: (hint: DropHint | null) => void;
  setNotice: (message: string | null) => void;
  setHistoryFlags: (canUndo: boolean, canRedo: boolean) => void;
}

export const useMapStore = create<MapState>((set, get) => ({
  projectId: null,
  workspaceId: null,
  projectData: {},
  role: "MEMBER",
  meId: "",
  nodes: {},
  people: {},

  heatmap: false,
  filter: EMPTY_FILTER,
  filterMode: "dim",
  focusId: null,
  editingId: null,
  dropHint: null,
  notice: null,

  canUndo: false,
  canRedo: false,

  setTree: (p) =>
    set((s) => ({
      projectId: p.project.id,
      workspaceId: p.project.workspaceId,
      projectData: p.project.data,
      role: p.role,
      meId: p.meId,
      nodes: Object.fromEntries(p.nodes.map((n) => [n.id, n])),
      people: Object.fromEntries(p.people.map((x) => [x.id, x])),
      // keep focus only if the node still exists
      focusId: s.focusId && p.nodes.some((n) => n.id === s.focusId) ? s.focusId : null,
    })),

  mergeRemote: (p) =>
    set((s) => {
      const keep = s.editingId ? s.nodes[s.editingId] : undefined;
      const nodes = Object.fromEntries(p.nodes.map((n) => [n.id, n]));
      if (keep && s.editingId && nodes[s.editingId]) nodes[s.editingId] = keep;
      return {
        nodes,
        people: Object.fromEntries(p.people.map((x) => [x.id, x])),
        role: p.role,
        projectData: p.project.data,
        focusId: s.focusId && nodes[s.focusId] ? s.focusId : null,
      };
    }),

  upsert: (node) => set((s) => ({ nodes: { ...s.nodes, [node.id]: node } })),

  patchLocal: (id, patch) =>
    set((s) => {
      const cur = s.nodes[id];
      return cur ? { nodes: { ...s.nodes, [id]: { ...cur, ...patch } } } : s;
    }),

  removeIds: (ids) =>
    set((s) => {
      const next = { ...s.nodes };
      for (const id of ids) delete next[id];
      return { nodes: next };
    }),

  applyChanges: (changes) =>
    set((s) => {
      const next = { ...s.nodes };
      for (const c of changes) {
        const cur = next[c.id];
        if (cur && (cur.progress !== c.progress || cur.health !== c.health)) {
          next[c.id] = { ...cur, progress: c.progress, health: c.health };
        }
      }
      return { nodes: next };
    }),

  recomputeLocal: () => {
    const all = Object.values(get().nodes);
    get().applyChanges(recomputeClient(all, new Date()));
  },

  setHeatmap: (heatmap) => set({ heatmap }),
  setFilter: (filter) => set({ filter }),
  setFilterMode: (filterMode) => set({ filterMode }),
  setFocus: (focusId) => set({ focusId }),
  setEditing: (editingId) => set({ editingId }),
  setDropHint: (dropHint) => set({ dropHint }),
  setNotice: (notice) => set({ notice }),
  setHistoryFlags: (canUndo, canRedo) => set({ canUndo, canRedo }),
}));
