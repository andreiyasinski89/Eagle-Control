import { z } from "zod";
import { db } from "@/server/db";
import { parseBody, route } from "@/server/http/handler";
import { requireCan, requireMember } from "@/server/services/access";

type P = { id: string };

export const GET = route<P>({}, async ({ params, userId }) => {
  const membership = await requireMember(userId ?? "", params.id);
  const workspace = await db.workspace.findUniqueOrThrow({ where: { id: params.id } });
  return { ...workspace, membership: { role: membership.role, crmAccess: membership.crmAccess } };
});

const patchSchema = z.object({ name: z.string().trim().min(2).max(60) });

export const PATCH = route<P>({}, async ({ req, params, userId }) => {
  await requireCan(userId ?? "", params.id, "workspace:update");
  const { name } = await parseBody(req, patchSchema);
  return db.workspace.update({ where: { id: params.id }, data: { name } });
});

export const DELETE = route<P>({}, async ({ params, userId }) => {
  await requireCan(userId ?? "", params.id, "workspace:delete");
  await db.workspace.delete({ where: { id: params.id } });
  return null;
});
