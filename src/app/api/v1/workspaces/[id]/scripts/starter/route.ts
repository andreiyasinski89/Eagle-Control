import { json, parseBody, route } from "@/server/http/handler";
import { addStarterScripts, starterScriptsSchema } from "@/server/services/crm/scripts";

export const POST = route<{ id: string }>({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const { locale } = await parseBody(req, starterScriptsSchema);
  return json(await addStarterScripts(userId ?? "", params.id, locale));
});
