import { json, parseBody, route } from "@/server/http/handler";
import { startMaterialUpload, uploadSchema } from "@/server/services/crm/materials";

/** A signed address to put a file to; the material is made afterwards with the key. */
export const POST = route<{ id: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await startMaterialUpload(userId ?? "", params.id, await parseBody(req, uploadSchema))));
