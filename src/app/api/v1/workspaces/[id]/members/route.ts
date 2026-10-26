import { route } from "@/server/http/handler";
import { requireCan } from "@/server/services/access";
import { listMembers } from "@/server/services/membership";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => {
  await requireCan(userId ?? "", params.id, "member:list");
  return listMembers(params.id);
});
