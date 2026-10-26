import { create } from "zustand";
import type { PresenceUser } from "@/server/realtime";

interface PresenceState {
  /** Other people's connections in the open project, by connection id. */
  others: Record<string, PresenceUser>;
  /** My own pointer in map coordinates, shared with the others (set by the canvas). */
  cursor: { x: number; y: number } | null;
  /** The node whose fields I am typing in (drawer); the canvas title editor uses the map store instead. */
  editing: string | null;
  setEditing: (id: string | null) => void;
  sync: (users: readonly PresenceUser[], selfConnId: string | null) => void;
  upsert: (user: PresenceUser) => void;
  leave: (connId: string) => void;
  clear: () => void;
  setCursor: (cursor: { x: number; y: number } | null) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  others: {},
  cursor: null,
  editing: null,
  setEditing: (editing) => set({ editing }),
  // `updatedAt` is re-stamped with this browser's clock on arrival: it is only used to expire quiet connections.
  sync: (users, selfConnId) => set({ others: Object.fromEntries(users.filter((u) => u.connId !== selfConnId).map((u) => [u.connId, { ...u, updatedAt: Date.now() }])) }),
  upsert: (user) => set((s) => ({ others: { ...s.others, [user.connId]: { ...user, updatedAt: Date.now() } } })),
  leave: (connId) =>
    set((s) => {
      if (!(connId in s.others)) return s;
      const next = { ...s.others };
      delete next[connId];
      return { others: next };
    }),
  clear: () => set({ others: {}, cursor: null, editing: null }),
  setCursor: (cursor) => set({ cursor }),
}));

/** Who else has this node selected or open for editing. */
export function peopleOn(others: Record<string, PresenceUser>, nodeId: string): { viewers: PresenceUser[]; editors: PresenceUser[] } {
  const all = Object.values(others);
  return { viewers: all.filter((u) => u.selectedNodeId === nodeId && u.editingNodeId !== nodeId), editors: all.filter((u) => u.editingNodeId === nodeId) };
}
