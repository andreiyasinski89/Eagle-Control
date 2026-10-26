import { env } from "@/lib/env";

/**
 * Realtime layer. Events are *hints* ("this project changed"), never data: receivers re-read through the normal,
 * authorised API, so a stream can never leak more than the API would. Presence (who is where) is the only state
 * kept here, in memory, and it expires on its own.
 *
 * The transport is an interface. `sse` (the default) is an in-process bus behind Server-Sent Events and works for
 * one server instance; more instances need a backplane (see DECISIONS.md). Other providers are not implemented.
 */

export interface PresenceUser {
  /** One browser connection; one person may have several tabs. */
  connId: string;
  userId: string;
  name: string;
  color: string;
  selectedNodeId: string | null;
  editingNodeId: string | null;
  /** Pointer position in map coordinates, null when off the canvas or in another view. */
  cursor: { x: number; y: number } | null;
  updatedAt: number;
}

export type RealtimeEvent =
  | { type: "tree.changed"; projectId: string; actorId: string }
  | { type: "comment.added"; projectId: string; nodeId: string; actorId: string }
  | { type: "board.changed"; workspaceId: string; actorId: string }
  | { type: "notification" }
  | { type: "presence"; user: PresenceUser }
  | { type: "presence.leave"; connId: string };

export type Handler = (room: string, event: RealtimeEvent) => void;

export interface RealtimeTransport {
  publish(room: string, event: RealtimeEvent): void;
  subscribe(room: string, handler: Handler): () => void;
}

class MemoryTransport implements RealtimeTransport {
  private readonly rooms = new Map<string, Set<Handler>>();

  publish(room: string, event: RealtimeEvent): void {
    for (const h of [...(this.rooms.get(room) ?? [])]) {
      try {
        h(room, event);
      } catch {
        /* one broken subscriber must not stop the others */
      }
    }
  }

  subscribe(room: string, handler: Handler): () => void {
    const set = this.rooms.get(room) ?? new Set<Handler>();
    set.add(handler);
    this.rooms.set(room, set);
    return () => {
      set.delete(handler);
      if (set.size === 0) this.rooms.delete(room);
    };
  }

  /** For tests and diagnostics. */
  subscriberCount(room: string): number {
    return this.rooms.get(room)?.size ?? 0;
  }
}

// One bus per process, also across dev-server module reloads.
const g = globalThis as unknown as { __meetowlRealtime?: MemoryTransport; __meetowlPresence?: Map<string, Map<string, PresenceUser>>; __meetowlConnections?: Map<string, Connection> };

export function transport(): RealtimeTransport {
  const provider = env().REALTIME_PROVIDER;
  if (provider !== "sse") throw new Error(`REALTIME_PROVIDER=${provider} is not implemented; use "sse"`);
  return (g.__meetowlRealtime ??= new MemoryTransport());
}

export function memoryTransportForTests(): MemoryTransport {
  return (g.__meetowlRealtime ??= new MemoryTransport());
}

let warned = false;
/** Fire and forget: a realtime failure must never fail the write that caused it. */
export function publish(room: string, event: RealtimeEvent): void {
  try {
    transport().publish(room, event);
  } catch (err) {
    if (!warned) {
      warned = true;
      console.warn("[realtime] publish failed:", err instanceof Error ? err.message : err);
    }
  }
}

export const projectRoom = (projectId: string) => `project:${projectId}`;
export const boardRoom = (workspaceId: string) => `board:${workspaceId}`;
export const userRoom = (userId: string) => `user:${userId}`;

/**
 * Like `publish`, for writers that announce from inside their transaction: it waits a moment so the receiver, which
 * re-reads through the API, finds the committed rows. (`transact` publishes after commit and needs no delay.)
 */
export function publishSoon(room: string, event: RealtimeEvent): void {
  const timer = setTimeout(() => publish(room, event), 250);
  timer.unref?.();
}

export function publishTree(projectIds: Iterable<string>, actorId: string): void {
  for (const projectId of new Set(projectIds)) publish(projectRoom(projectId), { type: "tree.changed", projectId, actorId });
}

export const publishComment = (projectId: string, nodeId: string, actorId: string) => publishSoon(projectRoom(projectId), { type: "comment.added", projectId, nodeId, actorId });

export const publishBoard = (workspaceId: string, actorId: string) => publishSoon(boardRoom(workspaceId), { type: "board.changed", workspaceId, actorId });

export const publishTreeSoon = (projectId: string, actorId: string) => publishSoon(projectRoom(projectId), { type: "tree.changed", projectId, actorId });

/**
 * Tells one person their notifications changed. Producers often call this inside the transaction that creates the
 * row, so it waits a moment: the receiver re-reads and must find the committed row.
 */
export const publishNotification = (userId: string): void => publishSoon(userRoom(userId), { type: "notification" });

// ── presence ───────────────────────────────────────────────────────────────

export const PRESENCE_TTL_MS = 45_000;
const COLORS = ["#6366f1", "#0891b2", "#d97706", "#9333ea", "#16a34a", "#dc2626", "#db2777", "#0d9488"];

/** The same person always gets the same colour. */
export function colorFor(userId: string): string {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length] as string;
}

const presence = (g.__meetowlPresence ??= new Map<string, Map<string, PresenceUser>>()); // room → connId → user

export function setPresence(room: string, user: Omit<PresenceUser, "updatedAt" | "color">, now = Date.now()): PresenceUser {
  const full: PresenceUser = { ...user, color: colorFor(user.userId), updatedAt: now };
  const map = presence.get(room) ?? new Map<string, PresenceUser>();
  map.set(user.connId, full);
  presence.set(room, map);
  publish(room, { type: "presence", user: full });
  return full;
}

export function removePresence(room: string, connId: string): void {
  const map = presence.get(room);
  if (!map?.delete(connId)) return;
  if (map.size === 0) presence.delete(room);
  publish(room, { type: "presence.leave", connId });
}

export function listPresence(room: string, now = Date.now()): PresenceUser[] {
  const map = presence.get(room);
  if (!map) return [];
  for (const [id, u] of map) if (now - u.updatedAt > PRESENCE_TTL_MS) map.delete(id);
  return [...map.values()];
}

/** Open stream connections: who they belong to and which rooms they listen to. */
export interface Connection {
  userId: string;
  name: string;
  /** Client room name → internal room, as authorised when the stream opened. */
  rooms: Map<string, string>;
}
export const connections = (g.__meetowlConnections ??= new Map<string, Connection>());
