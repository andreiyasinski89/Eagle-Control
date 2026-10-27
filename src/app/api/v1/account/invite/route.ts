import { json, route } from "@/server/http/handler";
import { getInvites } from "@/server/services/signup";

/** Your link for inviting people to the platform, your bonus points, and how far each invited person has got (steps only). */
export const GET = route({}, async ({ userId }) => json(await getInvites(userId ?? "")));
