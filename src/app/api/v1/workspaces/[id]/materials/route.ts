import { json, parseBody, route } from "@/server/http/handler";
import { createMaterial, listMaterials, materialSchema } from "@/server/services/crm/materials";

type P = { id: string };

export const GET = route<P>({}, async ({ params, userId }) => listMaterials(userId ?? "", params.id));

export const POST = route<P>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await createMaterial(userId ?? "", params.id, await parseBody(req, materialSchema)), 201));
