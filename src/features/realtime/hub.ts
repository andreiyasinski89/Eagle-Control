import type { PresenceUser, RealtimeEvent } from "@/server/realtime";

/** What a listener gets: the server event plus the client-side room name it arrived on. */
export type HubEvent = (RealtimeEvent & { room: string }) | { type: "presence.sync"; room: string; users: PresenceUser[] } | { type: "ready"; room: string; connId: string } | { type: "reconnected"; room: string };

type Listener = (event: HubEvent) => void;

const EVENT_TYPES = ["ready", "tree.changed", "comment.added", "board.changed", "notification", "presence", "presence.leave", "presence.sync"] as const;

/**
 * One Server-Sent Events connection per tab, shared by everything on the page (bell, project map, CRM board).
 * Rooms are reference-counted; when the set changes the connection is re-opened. After a drop the browser reconnects
 * by itself and listeners get a synthetic `reconnected` event, because anything may have changed meanwhile.
 */
class Hub {
  private listeners = new Map<string, Set<Listener>>();
  private source: EventSource | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private opened = false;
  connId: string | null = null;

  subscribe(rooms: readonly string[], listener: Listener): () => void {
    for (const r of rooms) {
      const set = this.listeners.get(r) ?? new Set<Listener>();
      set.add(listener);
      this.listeners.set(r, set);
    }
    this.schedule();
    return () => {
      for (const r of rooms) {
        const set = this.listeners.get(r);
        set?.delete(listener);
        if (set?.size === 0) this.listeners.delete(r);
      }
      this.schedule();
    };
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), 80);
  }

  private connect(): void {
    const rooms = [...this.listeners.keys()].sort();
    const key = rooms.join(",");
    if (this.source && (this.source as EventSource & { __rooms?: string }).__rooms === key) return;
    this.close();
    if (rooms.length === 0 || typeof EventSource === "undefined") return;
    const source = new EventSource(`/api/realtime/stream?rooms=${encodeURIComponent(key)}`) as EventSource & { __rooms?: string };
    source.__rooms = key;
    this.source = source;
    for (const type of EVENT_TYPES) {
      source.addEventListener(type, (e) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse((e as MessageEvent<string>).data) as Record<string, unknown>;
        } catch {
          return;
        }
        if (type === "ready") {
          this.connId = String(data.connId ?? "");
          this.emitAll({ type: "ready", room: "*", connId: this.connId });
          if (this.opened) this.emitAll({ type: "reconnected", room: "*" });
          this.opened = true;
          return;
        }
        this.emit(String(data.room ?? ""), { ...data, type } as unknown as HubEvent);
      });
    }
    // EventSource reconnects on its own; `ready` fires again then and triggers the `reconnected` event above.
    source.onerror = () => {
      this.connId = null;
    };
  }

  private close(): void {
    this.source?.close();
    this.source = null;
    this.connId = null;
    this.opened = false;
  }

  private emit(room: string, event: HubEvent): void {
    for (const l of [...(this.listeners.get(room) ?? [])]) l(event);
  }

  private emitAll(event: HubEvent): void {
    const seen = new Set<Listener>();
    for (const set of this.listeners.values()) {
      for (const l of set) {
        if (seen.has(l)) continue;
        seen.add(l);
        l(event);
      }
    }
  }

  /** Tells the server where I am; ignored until the stream is open. */
  sendPresence(room: string, state: { selectedNodeId: string | null; editingNodeId: string | null; cursor: { x: number; y: number } | null }): void {
    if (!this.connId) return;
    void fetch("/api/realtime/presence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ connId: this.connId, room, ...state }), keepalive: true }).catch(() => undefined);
  }
}

export const hub = new Hub();
