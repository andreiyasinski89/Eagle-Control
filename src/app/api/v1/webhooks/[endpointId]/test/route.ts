import { route } from "@/server/http/handler";
import { sendTest } from "@/server/webhooks";

export const POST = route<{ endpointId: string }>({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ params, userId }) => sendTest(userId ?? "", params.endpointId));
