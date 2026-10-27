import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import {
  classifyRows,
  COMPANY_FIELDS,
  CONTACT_FIELDS,
  decodeCsv,
  mapCompanyRow,
  mapContactRow,
  MAX_CSV_BYTES,
  parseCsv,
  suggestMapping,
  summarize,
  toCsv,
  type CompanyField,
  type CompanyRecord,
  type ContactField,
  type ContactRecord,
  type Mapping,
  type RowAction,
  type RowResult,
} from "@/modules/crm/csv";
import { companyKeys, contactKeys } from "@/modules/crm/dedupe";
import { normalizeCompanyName, normalizeDomain } from "@/modules/crm/normalize";
import { loadWorkspaceMember, logActivity, type Tx } from "@/server/services/nodes/access";
import { createCompaniesBulk, type CompanyFields } from "./companies";
import { assertContactCapacity, cleanEmails, contactWhere, createContactsBulk, updateContactIn, type BulkContact, type listContactsSchema } from "./contacts";
import { invalid, toNum } from "./common";

export const importOptionsSchema = z.object({
  entity: z.enum(["contacts", "companies"]),
  encoding: z.string().optional(),
  policy: z.enum(["skip", "update", "create"]).default("skip"),
  /** field → CSV header; omitted = use the suggestion */
  mapping: z.record(z.string()).optional(),
  /** Columns without a field of their own: their values are appended to the contact's note as "Header: value". */
  noteColumns: z.array(z.string()).max(60).optional(),
});
export type ImportOptions = z.infer<typeof importOptionsSchema>;

interface Prepared {
  encoding: string;
  guessed: boolean;
  delimiter: string;
  headers: string[];
  truncated: boolean;
  parseErrors: string[];
  mapping: Mapping<string>;
  total: number;
  contacts?: RowResult<ContactRecord>[];
  companies?: RowResult<CompanyRecord>[];
  actions: RowAction[];
}

export function assertCsvSize(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) throw invalid("empty_file", "The file is empty");
  if (bytes.byteLength > MAX_CSV_BYTES) throw new ApiError(413, "file_too_large", `CSV files can be up to ${MAX_CSV_BYTES / 1024 / 1024} MB`);
}

async function prepare(tx: Tx, workspaceId: string, bytes: Uint8Array, opts: ImportOptions): Promise<Prepared> {
  assertCsvSize(bytes);
  let decoded;
  try {
    decoded = decodeCsv(bytes, opts.encoding);
  } catch {
    throw invalid("bad_encoding", "Unknown or invalid text encoding");
  }
  const parsed = parseCsv(decoded.text);
  if (parsed.headers.length === 0 || parsed.rows.length === 0) throw invalid("no_rows", "No data rows found in the file");

  const fields = opts.entity === "contacts" ? CONTACT_FIELDS : COMPANY_FIELDS;
  const suggested = suggestMapping(parsed.headers, fields as readonly string[]);
  const mapping: Mapping<string> = {};
  for (const f of fields) {
    const chosen = opts.mapping ? opts.mapping[f] : suggested[f];
    if (chosen && parsed.headers.includes(chosen)) mapping[f] = chosen;
  }
  const base = { encoding: decoded.encoding, guessed: decoded.guessed, delimiter: parsed.delimiter, headers: parsed.headers, truncated: parsed.truncated, parseErrors: parsed.errors.slice(0, 20), mapping, total: parsed.rows.length };

  if (opts.entity === "contacts") {
    const rows = parsed.rows.map((r) => mapContactRow(r, mapping as Mapping<ContactField>, (opts.noteColumns ?? []).filter((h) => parsed.headers.includes(h))));
    const existing = new Map<string, string>();
    for (const c of await tx.contact.findMany({ where: { workspaceId, node: { archivedAt: null } }, select: { nodeId: true, firstName: true, lastName: true, emails: true, phones: true } })) {
      for (const k of contactKeys(c)) if (!existing.has(k)) existing.set(k, c.nodeId);
    }
    const actions = classifyRows(rows, (r) => contactKeys({ emails: r.email, phones: r.phone, firstName: r.firstName, lastName: r.lastName }), existing, opts.policy);
    return { ...base, contacts: rows, actions };
  }
  const rows = parsed.rows.map((r) => mapCompanyRow(r, mapping as Mapping<CompanyField>));
  const existing = new Map<string, string>();
  for (const c of await tx.company.findMany({ where: { workspaceId, node: { archivedAt: null } }, select: { nodeId: true, legalName: true, website: true, taxId: true } })) {
    for (const k of companyKeys(c)) if (!existing.has(k)) existing.set(k, c.nodeId);
  }
  const actions = classifyRows(rows, (r) => companyKeys(r), existing, opts.policy);
  return { ...base, companies: rows, actions };
}

/** Dry run: what the file contains, the suggested column mapping and what would happen to each row. */
export async function previewImport(userId: string, workspaceId: string, bytes: Uint8Array, opts: ImportOptions) {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:write");
  const p = await prepare(db, workspaceId, bytes, opts);
  const summary = summarize(p.actions);
  const rows = (p.contacts ?? p.companies ?? []).map((r, i) => ({ row: i + 2, ok: r.ok, error: r.ok ? null : r.error, action: p.actions[i]?.kind ?? "error", record: r.ok ? r.record : null }));
  return {
    encoding: p.encoding,
    encodingGuessed: p.guessed,
    delimiter: p.delimiter,
    headers: p.headers,
    mapping: p.mapping,
    fields: opts.entity === "contacts" ? [...CONTACT_FIELDS] : [...COMPANY_FIELDS],
    totalRows: p.total,
    truncated: p.truncated,
    parseErrors: p.parseErrors,
    summary: { ...summary, errors: summary.errors.slice(0, 50), errorCount: summary.errors.length },
    sample: rows.slice(0, 20),
  };
}

const nameKey = (name: string) => normalizeCompanyName(name) ?? name.toLowerCase();

/**
 * Finds or creates, in a few statements, every company the rows name: by name (ignoring "LLC" and case) or by website domain.
 * Returns a lookup for one row. Reading the workspace's companies once and creating the missing ones together is what keeps a
 * big import from waiting on the database once per person.
 */
async function resolveCompanies(tx: Tx, userId: string, workspaceId: string, recs: readonly { company: string | null; website: string | null }[]) {
  const cache = new Map<string, string>();
  const wanted = new Map<string, { name: string; website: string | null }>();
  for (const r of recs) if (r.company && !wanted.has(nameKey(r.company))) wanted.set(nameKey(r.company), { name: r.company, website: r.website });
  if (wanted.size > 0) {
    for (const c of await tx.company.findMany({ where: { workspaceId, node: { archivedAt: null } }, select: { nodeId: true, legalName: true, domain: true } })) {
      if (!cache.has(`n:${nameKey(c.legalName)}`)) cache.set(`n:${nameKey(c.legalName)}`, c.nodeId);
      if (c.domain && !cache.has(`d:${c.domain}`)) cache.set(`d:${c.domain}`, c.nodeId);
    }
    const missing: { name: string; website: string | null }[] = [];
    const planned = new Set<string>();
    for (const w of wanted.values()) {
      const domain = normalizeDomain(w.website);
      if (cache.has(`n:${nameKey(w.name)}`) || (domain && (cache.has(`d:${domain}`) || planned.has(domain)))) continue;
      missing.push(w);
      if (domain) planned.add(domain);
    }
    const ids = await createCompaniesBulk(tx, userId, workspaceId, missing.map((w) => ({ legalName: w.name, website: w.website, source: "import" })));
    missing.forEach((w, i) => {
      cache.set(`n:${nameKey(w.name)}`, ids[i] as string);
      const domain = normalizeDomain(w.website);
      if (domain && !cache.has(`d:${domain}`)) cache.set(`d:${domain}`, ids[i] as string);
    });
  }
  return (r: { company: string | null; website: string | null }): string | undefined => {
    if (!r.company) return undefined;
    const domain = normalizeDomain(r.website);
    return cache.get(`n:${nameKey(r.company)}`) ?? (domain ? cache.get(`d:${domain}`) : undefined);
  };
}

/** Applies the import in one transaction: either every valid row lands or none does. */
export async function commitImport(userId: string, workspaceId: string, bytes: Uint8Array, opts: ImportOptions) {
  return db.$transaction(
    async (tx) => {
      await loadWorkspaceMember(tx, userId, workspaceId, "crm:write");
      const p = await prepare(tx, workspaceId, bytes, opts);
      const summary = summarize(p.actions);
      if (opts.entity === "contacts") await assertContactCapacity(tx, workspaceId, summary.created);
      const toCreateContacts: BulkContact[] = [];
      const toCreateCompanies: CompanyFields[] = [];
      const companyOf = opts.entity === "contacts" ? await resolveCompanies(tx, userId, workspaceId, p.actions.flatMap((action, i) => (action.kind === "create" || action.kind === "update") && p.contacts?.[i]?.ok ? [(p.contacts[i] as { ok: true; record: ContactRecord }).record] : [])) : () => undefined;

      // New people and companies are collected and written together at the end; only updates of existing records go one by one.
      for (const [i, action] of p.actions.entries()) {
        if (action.kind !== "create" && action.kind !== "update") continue;
        if (opts.entity === "contacts") {
          const r = p.contacts?.[i];
          if (!r?.ok) continue;
          const rec = r.record;
          const companyId = companyOf(rec);
          if (action.kind === "create") {
            toCreateContacts.push({ firstName: rec.firstName, lastName: rec.lastName, position: rec.position, emails: rec.email, phones: rec.phone, messengers: rec.messengers, companyId, note: rec.notes });
          } else {
            const cur = await tx.contact.findUniqueOrThrow({ where: { nodeId: action.existingId } });
            await updateContactIn(tx, userId, action.existingId, {
              firstName: rec.firstName || cur.firstName,
              ...(rec.lastName ? { lastName: rec.lastName } : {}),
              ...(rec.position ? { position: rec.position } : {}),
              emails: [...new Set([...cur.emails, ...cleanEmails(rec.email)])],
              phones: [...new Set([...cur.phones, ...rec.phone])],
              messengers: rec.messengers,
              ...(companyId ? { companyId } : {}),
            });
          }
        } else {
          const r = p.companies?.[i];
          if (!r?.ok) continue;
          const rec = r.record;
          if (action.kind === "create") {
            toCreateCompanies.push({ legalName: rec.legalName, website: rec.website, industry: rec.industry, size: rec.size, country: rec.country, city: rec.city, address: rec.address, taxId: rec.taxId, source: rec.source ?? "import" });
          } else {
            const data: Prisma.CompanyUncheckedUpdateInput = {};
            for (const k of ["industry", "size", "country", "city", "address", "taxId", "source"] as const) if (rec[k]) data[k] = rec[k];
            if (rec.website) {
              data.website = rec.website;
              data.domain = normalizeDomain(rec.website);
            }
            if (Object.keys(data).length) await tx.company.update({ where: { nodeId: action.existingId }, data });
          }
        }
      }
      await createContactsBulk(tx, userId, workspaceId, toCreateContacts);
      await createCompaniesBulk(tx, userId, workspaceId, toCreateCompanies);
      await logActivity(tx, { workspaceId, nodeId: null, actorId: userId, action: "import.completed", diff: { entity: opts.entity, created: summary.created, updated: summary.updated, skipped: summary.skipped, errors: summary.errors.length } });
      return { ...summary, errorCount: summary.errors.length, errors: summary.errors.slice(0, 200) };
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
}

// ── export ─────────────────────────────────────────────────────────────────

const stamp = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export async function exportContactsCsv(userId: string, workspaceId: string, filter: z.infer<typeof listContactsSchema>): Promise<string> {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:export");
  const rows = await db.contact.findMany({ where: contactWhere(workspaceId, filter), orderBy: { firstName: "asc" }, take: 20_000, include: { company: { select: { legalName: true } } } });
  await db.activityLog.create({ data: { workspaceId, nodeId: null, actorId: userId, action: "export.contacts", diff: { rows: rows.length } } });
  return toCsv(
    ["First name", "Last name", "Email", "Phone", "Position", "Company", "Telegram", "WhatsApp", "Instagram", "Consent", "Last contacted"],
    rows.map((c) => {
      const m = c.messengers as Record<string, string>;
      return [c.firstName, c.lastName, c.emails.join("; "), c.phones.join("; "), c.position, c.company?.legalName, m.telegram, m.whatsapp, m.instagram, c.consentGiven ? "yes" : "no", stamp(c.lastContactedAt)];
    }),
  );
}

export async function exportCompaniesCsv(userId: string, workspaceId: string): Promise<string> {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:export");
  const rows = await db.company.findMany({ where: { workspaceId, node: { archivedAt: null } }, orderBy: { legalName: "asc" }, take: 20_000 });
  const won = await db.deal.groupBy({ by: ["companyId", "currency"], where: { workspaceId, stage: { isWon: true }, node: { archivedAt: null } }, _sum: { amount: true } });
  await db.activityLog.create({ data: { workspaceId, nodeId: null, actorId: userId, action: "export.companies", diff: { rows: rows.length } } });
  return toCsv(
    ["Company", "Website", "Industry", "Size", "Country", "City", "Address", "Tax ID", "Source", "Stage", "Revenue"],
    rows.map((c) => [c.legalName, c.website, c.industry, c.size, c.country, c.city, c.address, c.taxId, c.source, c.lifecycleStage, won.filter((w) => w.companyId === c.nodeId).map((w) => `${toNum(w._sum.amount)} ${w.currency}`).join("; ")]),
  );
}

