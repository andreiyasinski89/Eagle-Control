import { z } from "zod";
import { ApiError } from "@/server/http/errors";
import { parseBody, route } from "@/server/http/handler";
import { connections, setPresence } from "@/server/realtime";

const bodySchema = z.object({
  connId: z.string().min(8).max(64),
  room: z.string().startsWith("project:").max(80),
  selectedNodeId: z.string().max(40).nullable().default(null),
  editingNodeId: z.string().max(40).nullable().default(null),
  cursor: z.object({ x: z.number().finite().min(-1e6).max(1e6), y: z.number().finite().min(-1e6).max(1e6) }).nullable().default(null),
});

/**
 * Where I am in a project: selected node, node being edited, pointer. Accepted only for a stream connection that is mine
 * and for rooms it was authorised for when it opened, so no database work happens per pointer move.
 */
export const POST = route({ rateLimit: { limit: 900, windowMs: 60_000 } }, async ({ req, userId }) => {
  const b = await parseBody(req, bodySchema);
  const conn = connections.get(b.connId);
  if (!conn || conn.userId !== userId) throw new ApiError(404, "not_found", "Unknown connection");
  const internal = conn.rooms.get(b.room);
  if (!internal) throw new ApiError(403, "forbidden", "Not in this room");
  setPresence(internal, { connId: b.connId, userId: conn.userId, name: conn.name, selectedNodeId: b.selectedNodeId, editingNodeId: b.editingNodeId, cursor: b.cursor });
  return null;
});
