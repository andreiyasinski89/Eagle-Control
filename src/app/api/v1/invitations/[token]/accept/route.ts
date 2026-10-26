import { db } from "@/server/db";
import { unauthorized } from "@/server/http/errors";
import { route } from "@/server/http/handler";
import { acceptInvitation } from "@/server/services/invitation";

export const POST = route<{ token: string }>(
  { rateLimit: { limit: 20, windowMs: 60_000 } },
  async ({ params, userId }) => {
    const user = await db.user.findUnique({ where: { id: userId ?? "" }, select: { id: true, email: true } });
    if (!user) throw unauthorized();
    return acceptInvitation(params.token, user);
  },
);
