import Papa from "papaparse";

/** `PK` — every .xlsx is a zip archive, which is what tells it apart from a text file. */
export function looksLikeXlsx(bytes: Uint8Array): boolean {
  return bytes.byteLength > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    const iso = v.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ");
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v).trim();
}

/**
 * Turns the rows of a worksheet into CSV text for the CSV import pipeline.
 * The first row that looks like a table header is the header (spreadsheets often start with blank rows or a one-cell title);
 * blank rows and blank columns are dropped, and repeated header names get a number so no column is lost.
 */
export function sheetRowsToCsv(rows: readonly (readonly unknown[])[]): string {
  const text = rows.map((r) => r.map(cellText));
  const filled = (r: readonly string[]) => r.filter((c) => c !== "").length;
  const first = text.findIndex((r) => filled(r) > 0);
  if (first < 0) return "";
  // A title above the table ("Client list") has one cell where the table has many: skip rows that are less than half as wide (and a table with several columns never starts on a one-cell row).
  const widest = Math.max(...text.slice(first, first + 10).map(filled));
  const start = text.findIndex((r, i) => i >= first && filled(r) >= (widest >= 2 ? Math.max(2, Math.ceil(widest / 2)) : 1));
  const body = text.slice(start);
  const width = Math.max(...body.map((r) => r.length));
  const keep: number[] = [];
  for (let c = 0; c < width; c++) if (body.some((r) => (r[c] ?? "") !== "")) keep.push(c);

  const seen = new Map<string, number>();
  const header = keep.map((c) => {
    const base = body[0]?.[c] || `Column ${c + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
  const data = body
    .slice(1)
    .filter((r) => r.some((c) => c !== ""))
    .map((r) => keep.map((c) => r[c] ?? ""));
  return Papa.unparse({ fields: header, data });
}
