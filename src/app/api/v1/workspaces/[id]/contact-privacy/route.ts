import { json, parseBody, route } from "@/server/http/handler";
import { getContactPrivacy, privacySchema, setContactPrivacy } from "@/server/services/crm/privacy";

type P = { id: string };

export const GET = route<P>({}, async ({ params, userId }) => getContactPrivacy(userId ?? "", params.id));

/** Only the owner of the workspace may change it. */
export const PUT = route<P>({ rateLimit: { limit: 20, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await setContactPrivacy(userId ?? "", params.id, (await parseBody(req, privacySchema)).mode)));
