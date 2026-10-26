import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { authorizeRooms } from "@/server/realtime/access";
import { connections, listPresence, removePresence, transport, type RealtimeEvent } from "@/server/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events: one long-lived response per browser tab. Events are invalidation hints (no content), so what a
 * person receives can never exceed what the API would give them. A comment line every 25 s keeps proxies from closing it.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response(JSON.stringify({ error: { code: "unauthorized", message: "Sign in required" } }), { status: 401, headers: { "content-type": "application/json" } });

  const requested = (req.nextUrl.searchParams.get("rooms") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const [rooms, me] = await Promise.all([authorizeRooms(userId, requested), db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })]);
  if (!me) return new Response(null, { status: 401 });
  const connId = randomUUID();
  const encoder = new TextEncoder();
  const unsubscribe: (() => void)[] = [];
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    for (const off of unsubscribe) off();
    for (const room of rooms.values()) removePresence(room, connId);
    connections.delete(connId);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      connections.set(connId, { userId, name: me.name ?? me.email, rooms });

      const t = transport();
      for (const [name, room] of rooms) {
        unsubscribe.push(t.subscribe(room, (_r: string, ev: RealtimeEvent) => send(ev.type, { room: name, ...ev })));
      }
      send("ready", { connId, rooms: [...rooms.keys()] });
      for (const [name, room] of rooms) if (name.startsWith("project:")) send("presence.sync", { room: name, users: listPresence(room) });

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel: cleanup,
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}
