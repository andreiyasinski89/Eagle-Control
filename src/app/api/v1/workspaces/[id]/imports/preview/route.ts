import { route } from "@/server/http/handler";
import { readCsvUpload } from "@/server/http/upload";
import { previewImport } from "@/server/services/crm/imports";

export const POST = route<{ id: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const { bytes, options } = await readCsvUpload(req);
  return previewImport(userId ?? "", params.id, bytes, options);
});
