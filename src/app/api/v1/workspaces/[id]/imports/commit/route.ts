import { route } from "@/server/http/handler";
import { readCsvUpload } from "@/server/http/upload";
import { commitImport } from "@/server/services/crm/imports";

// A big file is read and written here: give the function the longest time the plan allows, not the 10-second default.
export const maxDuration = 60;

export const POST = route<{ id: string }>({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const { bytes, options } = await readCsvUpload(req);
  return commitImport(userId ?? "", params.id, bytes, options);
});
