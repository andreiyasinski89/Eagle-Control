import { json, parseBody, route } from "@/server/http/handler";
import { getPartnerOnboarding, startOnboarding, startOnboardingSchema } from "@/server/services/crm/partner-onboarding";

type P = { id: string; contactId: string };

export const GET = route<P>({}, async ({ params, userId }) => getPartnerOnboarding(userId ?? "", params.id, params.contactId));

/** Starts the first 30 days for the partner (once: a second call returns the project that is there). */
export const POST = route<P>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await startOnboarding(userId ?? "", params.id, params.contactId, (await parseBody(req, startOnboardingSchema)).locale ?? "ru")));
