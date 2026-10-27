import Papa from "papaparse";
import { z } from "zod";
import { normalizeEmail } from "./normalize";

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 5000;

export type ImportEntity = "contacts" | "companies";
export type DuplicatePolicy = "skip" | "update" | "create";

export interface DecodedText {
  text: string;
  encoding: string;
  /** True when UTF-8 failed and a legacy code page was assumed. */
  guessed: boolean;
}

/** BOM-aware; UTF-8 first, then the legacy code page Excel typically writes (1251 Cyrillic, 1250 Central European). */
export function decodeCsv(bytes: Uint8Array, preferred?: string): DecodedText {
  if (preferred && preferred !== "auto") {
    return { text: new TextDecoder(preferred).decode(bytes).replace(/^﻿/, ""), encoding: preferred, guessed: false };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, ""), encoding: "utf-8", guessed: false };
  } catch {
    // Bytes 0xB9..0xFF in Polish text are mostly 1250 letters; Cyrillic text is mostly 1251 letters. Pick by byte frequency.
    const sample = bytes.slice(0, 20_000);
    let cyr = 0;
    let pol = 0;
    for (const b of sample) {
      if (b >= 0xc0) cyr++; // 1251: А–я
      if (b === 0xb9 || b === 0xea || b === 0xb3 || b === 0xf3 || b === 0x9c || b === 0xbf || b === 0x9f || b === 0xe6 || b === 0xf1) pol++;
    }
    const encoding = pol > cyr / 2 && cyr < sample.length / 4 ? "windows-1250" : "windows-1251";
    return { text: new TextDecoder(encoding).decode(bytes), encoding, guessed: true };
  }
}

export interface ParsedCsv {
  delimiter: string;
  headers: string[];
  rows: Record<string, string>[];
  truncated: boolean;
  errors: string[];
}

export function parseCsv(text: string): ParsedCsv {
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t", "|"],
    transformHeader: (h) => h.trim(),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });
  const headers = (res.meta.fields ?? []).filter((h) => h.length > 0);
  const all = res.data.map((row) => Object.fromEntries(headers.map((h) => [h, String(row[h] ?? "")])));
  return {
    delimiter: res.meta.delimiter,
    headers,
    rows: all.slice(0, MAX_CSV_ROWS),
    truncated: all.length > MAX_CSV_ROWS,
    errors: res.errors.filter((e) => e.type !== "FieldMismatch").map((e) => `Row ${e.row ?? "?"}: ${e.message}`),
  };
}

// ── column mapping ─────────────────────────────────────────────────────────

export const CONTACT_FIELDS = ["fullName", "firstName", "lastName", "email", "phone", "position", "company", "website", "telegram", "whatsapp", "instagram", "source", "notes"] as const;
export const COMPANY_FIELDS = ["legalName", "website", "industry", "size", "country", "city", "address", "taxId", "source"] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];
export type CompanyField = (typeof COMPANY_FIELDS)[number];
export type Mapping<F extends string> = Partial<Record<F, string>>; // field → CSV header

const SYNONYMS: Record<string, string[]> = {
  fullName: ["name", "full name", "fullname", "contact", "contact name", "имя фамилия", "фио", "имя и фамилия", "imie i nazwisko", "imię i nazwisko"],
  firstName: ["first name", "firstname", "given name", "имя", "imie", "imię"],
  lastName: ["last name", "lastname", "surname", "family name", "фамилия", "nazwisko"],
  email: ["email", "e-mail", "mail", "email address", "почта", "эл. почта", "электронная почта", "adres email"],
  phone: ["phone", "telephone", "tel", "mobile", "cell", "phone number", "телефон", "тел", "моб", "telefon", "komorka", "komórka"],
  position: ["position", "title", "job title", "role", "должность", "stanowisko"],
  company: ["company", "company name", "organization", "organisation", "employer", "компания", "организация", "firma"],
  website: ["website", "web", "site", "url", "domain", "сайт", "strona", "www"],
  telegram: ["telegram", "tg", "телеграм"],
  whatsapp: ["whatsapp", "wa", "ватсап"],
  instagram: ["instagram", "insta", "инстаграм"],
  source: ["source", "lead source", "источник", "zrodlo", "źródło"],
  notes: ["notes", "note", "comment", "comments", "заметка", "заметки", "комментарий", "uwagi", "notatki"],
  legalName: ["company", "company name", "legal name", "name", "organization", "organisation", "название", "компания", "организация", "nazwa", "firma"],
  industry: ["industry", "sector", "отрасль", "сфера", "branza", "branża"],
  size: ["size", "company size", "employees", "размер", "число сотрудников", "wielkosc", "wielkość"],
  country: ["country", "страна", "kraj"],
  city: ["city", "town", "город", "miasto"],
  address: ["address", "street", "адрес", "adres"],
  taxId: ["tax id", "taxid", "vat", "vat id", "nip", "inn", "инн", "tax number"],
};

const squash = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Best guess of which CSV column feeds which field; each column is used at most once. */
export function suggestMapping<F extends string>(headers: readonly string[], fields: readonly F[]): Mapping<F> {
  const used = new Set<string>();
  const out: Partial<Record<F, string>> = {};
  const norm = headers.map((h) => ({ h, n: squash(h) }));
  for (const field of fields) {
    const names = [squash(field.replace(/([A-Z])/g, " $1")), ...(SYNONYMS[field] ?? []).map(squash)];
    const hit = norm.find((c) => !used.has(c.h) && names.includes(c.n));
    if (hit) {
      out[field] = hit.h;
      used.add(hit.h);
    }
  }
  return out;
}

// ── row → record ───────────────────────────────────────────────────────────

const clean = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? undefined : t;
};

function splitList(v: string | undefined): string[] {
  return (v ?? "")
    .split(/[;,|\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function splitFullName(full: string): { firstName: string; lastName: string | null } {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: null };
  return { firstName: parts[0] as string, lastName: parts.slice(1).join(" ") };
}

export interface ContactRecord {
  firstName: string;
  lastName: string | null;
  email: string[];
  phone: string[];
  position: string | null;
  company: string | null;
  website: string | null;
  messengers: Record<string, string>;
  source: string | null;
  notes: string | null;
}

export interface CompanyRecord {
  legalName: string;
  website: string | null;
  industry: string | null;
  size: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  taxId: string | null;
  source: string | null;
}

export type RowResult<T> = { ok: true; record: T } | { ok: false; error: string };

export function mapContactRow(row: Record<string, string>, mapping: Mapping<ContactField>, noteColumns: readonly string[] = []): RowResult<ContactRecord> {
  const get = (f: ContactField) => (mapping[f] ? clean(row[mapping[f] as string]) : undefined);
  let firstName = get("firstName");
  let lastName: string | null = get("lastName") ?? null;
  const full = get("fullName");
  // A lone "Name" column usually holds "First Last": split it when there is no separate last-name column.
  if (firstName && !lastName && !mapping.lastName && /s/.test(firstName) && !full) {
    const sp = splitFullName(firstName);
    firstName = sp.firstName;
    lastName = sp.lastName;
  }
  if (!firstName && full) {
    const s = splitFullName(full);
    firstName = s.firstName;
    lastName = lastName ?? s.lastName;
  }
  const emails = splitList(get("email"));
  const badEmail = emails.find((e) => !normalizeEmail(e));
  if (badEmail) return { ok: false, error: `Invalid e-mail "${badEmail}"` };
  const phone = splitList(get("phone"));
  if (!firstName && emails.length === 0 && phone.length === 0) return { ok: false, error: "Row has no name, e-mail or phone" };

  const messengers: Record<string, string> = {};
  for (const m of ["telegram", "whatsapp", "instagram"] as const) {
    const v = get(m);
    if (v) messengers[m] = v;
  }
  return {
    ok: true,
    record: {
      firstName: firstName ?? emails[0]?.split("@")[0] ?? phone[0] ?? "",
      lastName,
      email: emails.map((e) => normalizeEmail(e) as string),
      phone,
      position: get("position") ?? null,
      company: get("company") ?? null,
      website: get("website") ?? null,
      messengers,
      source: get("source") ?? null,
      notes: [get("notes"), ...noteColumns.map((h) => (clean(row[h]) ? `${h}: ${clean(row[h])}` : undefined))].filter(Boolean).join("\n") || null,
    },
  };
}

const companySchema = z.object({ legalName: z.string().min(1) });

export function mapCompanyRow(row: Record<string, string>, mapping: Mapping<CompanyField>): RowResult<CompanyRecord> {
  const get = (f: CompanyField) => (mapping[f] ? clean(row[mapping[f] as string]) : undefined);
  const parsed = companySchema.safeParse({ legalName: get("legalName") });
  if (!parsed.success) return { ok: false, error: "Row has no company name" };
  return {
    ok: true,
    record: {
      legalName: parsed.data.legalName,
      website: get("website") ?? null,
      industry: get("industry") ?? null,
      size: get("size") ?? null,
      country: get("country") ?? null,
      city: get("city") ?? null,
      address: get("address") ?? null,
      taxId: get("taxId") ?? null,
      source: get("source") ?? null,
    },
  };
}

// ── duplicate policy ───────────────────────────────────────────────────────

export type RowAction =
  | { kind: "create" }
  | { kind: "update"; existingId: string }
  | { kind: "skip"; reason: "duplicate_existing" | "duplicate_in_file" }
  | { kind: "error"; message: string };

/**
 * Decides what to do with each parsed row. `existing` maps duplicate keys (see dedupe.ts) to the id
 * of the record already stored; rows later in the file also collide with earlier rows of the same file.
 */
export function classifyRows<T>(
  rows: readonly RowResult<T>[],
  keysOf: (record: T) => string[],
  existing: ReadonlyMap<string, string>,
  policy: DuplicatePolicy,
): RowAction[] {
  const seenInFile = new Map<string, number>();
  return rows.map((r, i): RowAction => {
    if (!r.ok) return { kind: "error", message: r.error };
    const keys = keysOf(r.record);
    const existingId = keys.map((k) => existing.get(k)).find((x): x is string => !!x);
    const earlier = keys.map((k) => seenInFile.get(k)).find((x): x is number => x !== undefined);
    for (const k of keys) if (!seenInFile.has(k)) seenInFile.set(k, i);

    if (policy === "create") return { kind: "create" };
    if (earlier !== undefined) return { kind: "skip", reason: "duplicate_in_file" };
    if (existingId) return policy === "update" ? { kind: "update", existingId } : { kind: "skip", reason: "duplicate_existing" };
    return { kind: "create" };
  });
}

export interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export function summarize(actions: readonly RowAction[]): ImportSummary {
  const s: ImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] };
  actions.forEach((a, i) => {
    if (a.kind === "create") s.created++;
    else if (a.kind === "update") s.updated++;
    else if (a.kind === "skip") s.skipped++;
    else s.errors.push({ row: i + 2, message: a.message }); // +2: header row, 1-based
  });
  return s;
}

// ── export ─────────────────────────────────────────────────────────────────

/** Spreadsheet formulas in exported cells are neutralised (CSV injection). */
export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  const harmless =
    /^\+\d[\d\s().-]*$/.test(s) || // international phone number
    /^-\d+(\.\d+)?$/.test(s) || // plain negative number
    /^@[A-Za-z0-9_]{3,}$/.test(s); // @handle (Telegram, Instagram)
  return /^[=+\-@\t\r]/.test(s) && !harmless ? `'${s}` : s;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return Papa.unparse({ fields: [...headers], data: rows.map((r) => r.map(csvCell)) }, { newline: "\r\n" });
}
