import { route } from "@/server/http/handler";
import { deleteLostReason } from "@/server/services/crm/pipelines";

export const DELETE = route<{ reasonId: string }>({}, async ({ params, userId }) => {
  await deleteLostReason(userId ?? "", params.reasonId);
  return null;
});
