import { json, parseBody, route } from "@/server/http/handler";
import { setupTestSchema, testPlatformProvider } from "@/server/services/platform-setup";

export const POST = route({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, userId }) => json(await testPlatformProvider(userId ?? "", (await parseBody(req, setupTestSchema)).provider)));
