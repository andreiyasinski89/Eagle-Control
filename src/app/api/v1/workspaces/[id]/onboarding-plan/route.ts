import { json, parseBody, route } from "@/server/http/handler";
import { getOnboardingPlan, planBodySchema, planQuerySchema, saveOnboardingPlan } from "@/server/services/crm/partner-onboarding";

type P = { id: string };

export const GET = route<P>({}, async ({ req, params, userId }) => getOnboardingPlan(userId ?? "", params.id, planQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams)).locale));

/** Owners and admins only. `steps: null` goes back to the default plan. */
export const PUT = route<P>({ rateLimit: { limit: 20, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const body = await parseBody(req, planBodySchema);
  return json(await saveOnboardingPlan(userId ?? "", params.id, body.steps, body.locale ?? "ru"));
});
