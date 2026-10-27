import { json, route } from "@/server/http/handler";
import { getOrCreateReferralLink } from "@/server/services/signup";

/** The signed-in member's invitation link for this workspace (made on first use) and how many people joined through it. */
export const GET = route<{ id: string }>({}, async ({ params, userId }) => json(await getOrCreateReferralLink(userId ?? "", params.id)));
