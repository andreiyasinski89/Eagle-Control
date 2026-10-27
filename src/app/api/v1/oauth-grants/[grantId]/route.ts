import { route } from "@/server/http/handler";
import { revokeGrant } from "@/server/services/oauth";

export const DELETE = route<{ grantId: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ params, userId }) => {
  await revokeGrant(userId ?? "", params.grantId);
  return null;
});
