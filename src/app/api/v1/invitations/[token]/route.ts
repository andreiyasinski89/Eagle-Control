import { route } from "@/server/http/handler";
import { previewInvitation } from "@/server/services/invitation";

export const GET = route<{ token: string }>(
  { auth: false, rateLimit: { limit: 30, windowMs: 60_000 } },
  async ({ params }) => previewInvitation(params.token),
);
