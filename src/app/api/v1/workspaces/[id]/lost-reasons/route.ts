import { json, parseBody, route } from "@/server/http/handler";
import { createLostReason, listLostReasons, lostReasonSchema } from "@/server/services/crm/pipelines";

type P = { id: string };

export const GET = route<P>({}, async ({ params, userId }) => listLostReasons(userId ?? "", params.id));

export const POST = route<P>({}, async ({ req, params, userId }) => {
  const { name } = await parseBody(req, lostReasonSchema);
  return json(await createLostReason(userId ?? "", params.id, name), 201);
});
