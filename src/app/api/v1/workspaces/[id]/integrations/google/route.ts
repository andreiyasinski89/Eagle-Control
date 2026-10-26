import { route } from "@/server/http/handler";
import { disconnectGoogle } from "@/server/integrations/google";

export const DELETE = route<{ id: string }>({}, async ({ params, userId }) => {
  await disconnectGoogle(userId ?? "", params.id);
  return null;
});
