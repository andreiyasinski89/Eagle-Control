import { route } from "@/server/http/handler";
import { getPlatformSetup } from "@/server/services/platform-setup";

export const GET = route({}, async ({ userId }) => getPlatformSetup(userId ?? ""));
