import { route } from "@/server/http/handler";
import { disconnectTelegram } from "@/server/integrations/telegram";

export const DELETE = route<{ id: string }>({}, async ({ params, userId }) => {
  await disconnectTelegram(userId ?? "", params.id);
  return null;
});
