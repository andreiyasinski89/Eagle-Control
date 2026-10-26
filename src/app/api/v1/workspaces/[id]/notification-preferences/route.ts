import { z } from "zod";
import { parseBody, route } from "@/server/http/handler";
import { requireMember } from "@/server/services/access";
import { NOTIFY_KINDS, getPreferences, setPreference } from "@/server/services/notify";

type P = { id: string };

export const GET = route<P>({}, async ({ params, userId }) => {
  await requireMember(userId ?? "", params.id);
  return getPreferences(userId ?? "", params.id);
});

const schema = z.object({ kind: z.enum(NOTIFY_KINDS), channels: z.array(z.enum(["email", "slack", "telegram"])).max(3) });

export const PUT = route<P>({}, async ({ req, params, userId }) => {
  await requireMember(userId ?? "", params.id);
  const { kind, channels } = await parseBody(req, schema);
  await setPreference(userId ?? "", params.id, kind, channels);
  return getPreferences(userId ?? "", params.id);
});
