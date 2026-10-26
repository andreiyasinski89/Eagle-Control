import { route } from "@/server/http/handler";
import { searchNodes } from "@/server/services/nodes/queries";

export const GET = route<{ id: string }>({ rateLimit: { limit: 120, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;
  return searchNodes(userId ?? "", params.id, q.slice(0, 100), projectId);
});
