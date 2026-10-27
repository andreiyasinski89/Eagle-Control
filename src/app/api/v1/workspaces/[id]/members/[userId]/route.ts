import { z } from "zod";
import { CRM_LEVELS } from "@/modules/crm/access";
import { forbidden } from "@/server/http/errors";
import { parseBody, route } from "@/server/http/handler";
import { can } from "@/server/policies";
import { requireMember } from "@/server/services/access";
import { removeMember, updateMember } from "@/server/services/membership";

type P = { id: string; userId: string };

const patchSchema = z
  .object({
    role: z.enum(["OWNER", "ADMIN", "MEMBER", "GUEST", "CLIENT"]).optional(),
    crmAccess: z.boolean().optional(),
    /** Whose people the member sees in the CRM: none, their own, their team's, or everyone's. */
    crmLevel: z.enum(CRM_LEVELS).optional(),
    hourlyRate: z.number().min(0).max(100000).nullable().optional(),
  })
  .refine((v) => v.role !== undefined || v.crmAccess !== undefined || v.crmLevel !== undefined || v.hourlyRate !== undefined, "Nothing to update");

export const PATCH = route<P>({}, async ({ req, params, userId }) => {
  const actor = await requireMember(userId ?? "", params.id);
  if (!can(actor, "member:invite")) throw forbidden();
  const patch = await parseBody(req, patchSchema);
  return updateMember({ userId: actor.userId, role: actor.role }, params.id, params.userId, patch);
});

export const DELETE = route<P>({}, async ({ params, userId }) => {
  const actor = await requireMember(userId ?? "", params.id);
  await removeMember({ userId: actor.userId, role: actor.role }, params.id, params.userId);
  return null;
});
