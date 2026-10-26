import { json, route } from "@/server/http/handler";
import { deleteLink, transact } from "@/server/services/nodes/ops";

export const DELETE = route<{ linkId: string }>({}, async ({ params, userId }) => {
  const { changes } = await transact(userId ?? "", (ctx) => deleteLink(ctx, params.linkId));
  return json({ changes });
});
