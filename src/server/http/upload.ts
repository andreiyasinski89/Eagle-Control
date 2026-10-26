import type { NextRequest } from "next/server";
import { importOptionsSchema, assertCsvSize, type ImportOptions } from "@/server/services/crm/imports";
import { ApiError } from "./errors";

/** Reads `file` plus the import options (`entity`, `policy`, `encoding`, `mapping` as JSON) from a multipart form. */
export async function readCsvUpload(req: NextRequest): Promise<{ bytes: Uint8Array; options: ImportOptions }> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, "invalid_form", "Send the CSV as multipart/form-data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "no_file", "Attach the CSV as the `file` field");
  if (file.size > 6 * 1024 * 1024) throw new ApiError(413, "file_too_large", "CSV files can be up to 5 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertCsvSize(bytes);

  let mapping: unknown;
  const rawMapping = form.get("mapping");
  if (typeof rawMapping === "string" && rawMapping.trim()) {
    try {
      mapping = JSON.parse(rawMapping);
    } catch {
      throw new ApiError(400, "invalid_mapping", "`mapping` must be JSON");
    }
  }
  const pick = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v ? v : undefined;
  };
  const options = importOptionsSchema.parse({ entity: pick("entity"), policy: pick("policy"), encoding: pick("encoding"), mapping });
  return { bytes, options };
}
