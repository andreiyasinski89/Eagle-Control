import { z } from "zod";
import { CRM_LEVELS, levelFields } from "@/modules/crm/access";
import { json, parseBody, route } from "@/server/http/handler";
import { requireCan } from "@/server/services/access";
import { createInvitation, listInvitations } from "@/server/services/invitation";

type P = { id: string };

export const GET = route<P>({}, async ({ params, userId }) => {
  await requireCan(userId ?? "", params.id, "member:invite");
  return listInvitations(params.id);
});

const createSchema = z.object({
  email: z.string().trim().email().max(200),
  role: z.enum(["ADMIN", "MEMBER", "GUEST", "CLIENT"]).default("MEMBER"),
  crmAccess: z.boolean().default(false),
  crmLevel: z.enum(CRM_LEVELS).optional(),
  projectIds: z.array(z.string()).max(50).default([]),
});

export const POST = route<P>({ rateLimit: { limit: 20, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const actor = await requireCan(userId ?? "", params.id, "member:invite");
  const { crmLevel, ...input } = await parseBody(req, createSchema);
  const inv = await createInvitation({
    workspaceId: params.id,
    actor: { userId: actor.userId, role: actor.role },
    ...input,
    ...(crmLevel ? levelFields(crmLevel) : { crmScope: "ALL" as const }),
  });
  return json({ id: inv.id, email: inv.email, role: inv.role, expiresAt: inv.expiresAt }, 201);
});
