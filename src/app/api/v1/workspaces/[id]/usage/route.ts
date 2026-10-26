import { db } from "@/server/db";
import { route } from "@/server/http/handler";
import { requireMember } from "@/server/services/access";
import { getUsage } from "@/server/services/workspace";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => {
  await requireMember(userId ?? "", params.id);
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: params.id }, select: { plan: true } });
  return getUsage(params.id, ws.plan);
});
