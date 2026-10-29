import { json, parseBody, route } from "@/server/http/handler";
import { deleteMaterial, patchMaterialSchema, updateMaterial } from "@/server/services/crm/materials";

type P = { materialId: string };

export const PATCH = route<P>({}, async ({ req, params, userId }) => json(await updateMaterial(userId ?? "", params.materialId, await parseBody(req, patchMaterialSchema))));

export const DELETE = route<P>({}, async ({ params, userId }) => {
  await deleteMaterial(userId ?? "", params.materialId);
  return json({ ok: true });
});
