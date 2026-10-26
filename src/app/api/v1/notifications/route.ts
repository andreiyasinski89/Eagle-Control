import { route } from "@/server/http/handler";
import { listNotifications } from "@/server/services/notify";

export const GET = route({}, async ({ req, userId }) => {
  const sp = req.nextUrl.searchParams;
  return listNotifications(userId ?? "", { workspaceId: sp.get("workspaceId") ?? undefined, unreadOnly: sp.get("unread") === "1", limit: Number(sp.get("limit") ?? 30) || 30 });
});
