import type { NextRequest } from "next/server";
import { importOptionsSchema, assertCsvSize, type ImportOptions } from "@/server/services/crm/imports";
import { looksLikeXlsx, sheetRowsToCsv } from "@/modules/crm/xlsx";
import { ApiError } from "./errors";

/** An Excel workbook becomes CSV text (its first sheet), so Excel and CSV files share one import path. */
async function xlsxToCsvBytes(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const { readSheet } = await import("read-excel-file/universal");
    const rows = await readSheet(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    return new TextEncoder().encode(sheetRowsToCsv(rows));
  } catch {
    throw new ApiError(400, "bad_xlsx", "Could not read this Excel file. Save it as .xlsx (not .xls or .xlsm) or export it as CSV");
  }
}

/** Reads `file` plus the import options (`entity`, `policy`, `encoding`, `mapping` as JSON) from a multipart form. */
export async function readCsvUpload(req: NextRequest): Promise<{ bytes: Uint8Array; options: ImportOptions }> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, "invalid_form", "Send the file as multipart/form-data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "no_file", "Attach the file as the `file` field");
  if (file.size > 6 * 1024 * 1024) throw new ApiError(413, "file_too_large", "Files can be up to 5 MB");
  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
  if (looksLikeXlsx(bytes)) bytes = await xlsxToCsvBytes(bytes);
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
  let noteColumns: unknown;
  const rawNotes = form.get("noteColumns");
  if (typeof rawNotes === "string" && rawNotes.trim()) {
    try {
      noteColumns = JSON.parse(rawNotes);
    } catch {
      throw new ApiError(400, "invalid_note_columns", "`noteColumns` must be JSON");
    }
  }
  const options = importOptionsSchema.parse({ entity: pick("entity"), policy: pick("policy"), encoding: pick("encoding"), mapping, noteColumns });
  return { bytes, options };
}
