import { route } from "@/server/http/handler";
import { revokeToken } from "@/server/public-api/tokens";

export const DELETE = route<{ tokenId: string }>({}, async ({ params, userId }) => {
  await revokeToken(userId ?? "", params.tokenId);
  return null;
});
