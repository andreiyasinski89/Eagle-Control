import { db } from "@/server/db";
import { can } from "@/server/policies";
import { loadNode } from "@/server/services/nodes/access";
import { boardRoom, projectRoom, userRoom } from "./index";

export const MAX_ROOMS = 6;

/**
 * Turns the room names a browser asks for into the rooms it may listen to. Names are client-side
 * (`user`, `project:<id>`, `board:<workspaceId>`); anything the person could not read through the API is dropped.
 */
export async function authorizeRooms(userId: string, requested: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const name of [...new Set(requested)].slice(0, MAX_ROOMS)) {
    if (name === "user") {
      out.set(name, userRoom(userId));
    } else if (name.startsWith("project:")) {
      const id = name.slice("project:".length);
      try {
        const { node } = await loadNode(db, userId, id);
        if (node.type === "PROJECT") out.set(name, projectRoom(id));
      } catch {
        /* no access: the room simply does not exist for this person */
      }
    } else if (name.startsWith("board:")) {
      const id = name.slice("board:".length);
      const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId: id } } });
      if (m && can(m, "crm:read")) out.set(name, boardRoom(id));
    }
  }
  return out;
}
