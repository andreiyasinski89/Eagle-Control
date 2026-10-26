import { route } from "@/server/http/handler";
import { requireCan } from "@/server/services/access";
import { revokeInvitation } from "@/server/services/invitation";

export const DELETE = route<{ id: string; invId: string }>({}, async ({ params, userId }) => {
  await requireCan(userId ?? "", params.id, "member:invite");
  await revokeInvitation(params.id, params.invId);
  return null;
});
