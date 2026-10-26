import { z } from "zod";
import type { Health, LifecycleStage, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { companyKeys, findDuplicateGroups } from "@/modules/crm/dedupe";
import { dealHealth, effectiveProbability, stageStatus } from "@/modules/crm/deal-rules";
import { normalizeDomain } from "@/modules/crm/normalize";
import { loadWorkspaceMember, logActivity, type Tx } from "@/server/services/nodes/access";
import { assertWorkspaceMember, loadCrmNode, pageArgs, STALE_DAYS, STUCK_DAYS, toNum } from "./common";

const text = (max: number) => z.string().trim().max(max).nullable().optional();

export const companyFieldsSchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  website: text(200),
  industry: text(100),
  size: text(50),
  country: text(80),
  city: text(80),
  address: text(300),
  taxId: text(50),
  source: text(80),
  ownerId: z.string().nullable().optional(),
  lifecycleStage: z.enum(["LEAD", "PROSPECT", "CUSTOMER", "CHURNED"]).optional(),
  customFields: z.record(z.unknown()).optional(),
});
export const createCompanySchema = companyFieldsSchema.extend({ allowDuplicate: z.boolean().default(false) });
export const patchCompanySchema = companyFieldsSchema.partial().refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type CompanyFields = z.infer<typeof companyFieldsSchema>;

const blank = (v: string | null | undefined) => (v === undefined ? undefined : v === null || v.trim() === "" ? null : v.trim());

/** Existing active companies that look like `fields` (same site, name or tax id). */
export async function findCompanyMatches(tx: Tx, workspaceId: string, fields: Pick<CompanyFields, "legalName" | "website" | "taxId">, ignoreId?: string) {
  const mine = companyKeys({ legalName: fields.legalName, website: fields.website ?? null, taxId: fields.taxId ?? null });
  if (mine.length === 0) return [];
  const all = await tx.company.findMany({ where: { workspaceId, node: { archivedAt: null }, ...(ignoreId ? { nodeId: { not: ignoreId } } : {}) }, select: { nodeId: true, legalName: true, website: true, taxId: true } });
  return all.filter((c) => companyKeys(c).some((k) => mine.includes(k))).map((c) => ({ id: c.nodeId, legalName: c.legalName, website: c.website }));
}

export async function createCompanyIn(tx: Tx, userId: string, workspaceId: string, input: CompanyFields): Promise<{ id: string }> {
  await assertWorkspaceMember(tx, workspaceId, input.ownerId);
  const node = await tx.node.create({
    data: { workspaceId, type: "COMPANY", title: input.legalName, createdById: userId, position: Date.now(), data: {} },
  });
  await tx.company.create({
    data: {
      nodeId: node.id,
      workspaceId,
      legalName: input.legalName,
      website: blank(input.website) ?? null,
      domain: normalizeDomain(input.website),
      industry: blank(input.industry) ?? null,
      size: blank(input.size) ?? null,
      country: blank(input.country) ?? null,
      city: blank(input.city) ?? null,
      address: blank(input.address) ?? null,
      taxId: blank(input.taxId) ?? null,
      source: blank(input.source) ?? null,
      ownerId: input.ownerId ?? userId,
      lifecycleStage: input.lifecycleStage ?? "LEAD",
      customFields: (input.customFields ?? {}) as Prisma.InputJsonValue,
    },
  });
  await logActivity(tx, { workspaceId, nodeId: node.id, actorId: userId, action: "company.created", diff: { legalName: input.legalName } });
  return { id: node.id };
}

export async function createCompany(userId: string, workspaceId: string, input: z.infer<typeof createCompanySchema>) {
  return db.$transaction(async (tx) => {
    await loadWorkspaceMember(tx, userId, workspaceId, "crm:write");
    if (!input.allowDuplicate) {
      const matches = await findCompanyMatches(tx, workspaceId, input);
      if (matches.length) throw new ApiError(409, "duplicate_company", "A similar company already exists", { candidates: matches });
    }
    const { id } = await createCompanyIn(tx, userId, workspaceId, input);
    return getCompanyIn(tx, userId, id);
  });
}

export async function updateCompany(userId: string, companyId: string, patch: z.infer<typeof patchCompanySchema>) {
  return db.$transaction(async (tx) => {
    const node = await loadCrmNode(tx, userId, companyId, "COMPANY", true);
    await assertWorkspaceMember(tx, node.workspaceId, patch.ownerId);
    const data: Prisma.CompanyUncheckedUpdateInput = {};
    if (patch.legalName !== undefined) data.legalName = patch.legalName;
    for (const k of ["industry", "size", "country", "city", "address", "taxId", "source"] as const) {
      if (patch[k] !== undefined) data[k] = blank(patch[k]);
    }
    if (patch.website !== undefined) {
      data.website = blank(patch.website);
      data.domain = normalizeDomain(patch.website);
    }
    if (patch.ownerId !== undefined) data.ownerId = patch.ownerId;
    if (patch.lifecycleStage !== undefined) data.lifecycleStage = patch.lifecycleStage;
    if (patch.customFields !== undefined) data.customFields = patch.customFields as Prisma.InputJsonValue;
    await tx.company.update({ where: { nodeId: companyId }, data });
    if (patch.legalName) await tx.node.update({ where: { id: companyId }, data: { title: patch.legalName } });
    await logActivity(tx, { workspaceId: node.workspaceId, nodeId: companyId, actorId: userId, action: "company.updated", diff: { fields: Object.keys(patch) } });
    return getCompanyIn(tx, userId, companyId);
  });
}

/** Archives a company; its contacts and deals stay and become stand-alone. Refuses while deals are open. */
export async function archiveCompany(userId: string, companyId: string) {
  await db.$transaction(async (tx) => {
    const node = await loadCrmNode(tx, userId, companyId, "COMPANY", true);
    const open = await tx.deal.count({ where: { companyId, node: { archivedAt: null }, stage: { isWon: false, isLost: false } } });
    if (open > 0) throw new ApiError(409, "company_has_open_deals", "Close or move its open deals first", { deals: open });
    await tx.node.updateMany({ where: { parentId: companyId }, data: { parentId: null, rootId: null } });
    await tx.contact.updateMany({ where: { companyId }, data: { companyId: null } });
    await tx.deal.updateMany({ where: { companyId }, data: { companyId: null } });
    await tx.node.update({ where: { id: companyId }, data: { archivedAt: new Date() } });
    await logActivity(tx, { workspaceId: node.workspaceId, nodeId: companyId, actorId: userId, action: "company.archived" });
  });
}

// ── reads ──────────────────────────────────────────────────────────────────

export const listCompaniesSchema = z.object({
  q: z.string().trim().max(100).optional(),
  lifecycle: z.enum(["LEAD", "PROSPECT", "CUSTOMER", "CHURNED"]).optional(),
  ownerId: z.string().optional(),
  sort: z.enum(["legalName", "createdAt", "lifecycleStage"]).default("legalName"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function listCompanies(userId: string, workspaceId: string, f: z.infer<typeof listCompaniesSchema>) {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const where: Prisma.CompanyWhereInput = {
    workspaceId,
    node: { archivedAt: null },
    ...(f.lifecycle ? { lifecycleStage: f.lifecycle } : {}),
    ...(f.ownerId ? { ownerId: f.ownerId } : {}),
    ...(f.q ? { OR: [{ legalName: { contains: f.q, mode: "insensitive" } }, { website: { contains: f.q, mode: "insensitive" } }, { city: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
  const { skip, take, page, pageSize } = pageArgs(f);
  const orderBy: Prisma.CompanyOrderByWithRelationInput = f.sort === "createdAt" ? { node: { createdAt: f.dir } } : { [f.sort]: f.dir };
  const [total, rows] = await Promise.all([db.company.count({ where }), db.company.findMany({ where, orderBy, skip, take, include: { node: { select: { createdAt: true } } } })]);
  const ids = rows.map((r) => r.nodeId);

  const [contacts, won, open, links] = await Promise.all([
    db.contact.groupBy({ by: ["companyId"], where: { companyId: { in: ids }, node: { archivedAt: null } }, _count: true }),
    db.deal.groupBy({ by: ["companyId", "currency"], where: { companyId: { in: ids }, stage: { isWon: true }, node: { archivedAt: null } }, _sum: { amount: true } }),
    db.deal.groupBy({ by: ["companyId"], where: { companyId: { in: ids }, stage: { isWon: false, isLost: false }, node: { archivedAt: null } }, _count: true }),
    db.nodeLink.findMany({
      where: { kind: "DEAL_PROJECT", from: { deal: { companyId: { in: ids } } }, to: { archivedAt: null } },
      select: { from: { select: { deal: { select: { companyId: true } } } }, to: { select: { health: true } } },
    }),
  ]);
  const risk = new Map<string, Health>();
  const rank: Record<Health, number> = { GREEN: 0, YELLOW: 1, RED: 2 };
  for (const l of links) {
    const cid = l.from.deal?.companyId;
    if (cid && rank[l.to.health] >= rank[risk.get(cid) ?? "GREEN"]) risk.set(cid, l.to.health);
  }
  return {
    total,
    page,
    pageSize,
    items: rows.map((c) => ({
      id: c.nodeId,
      legalName: c.legalName,
      website: c.website,
      industry: c.industry,
      city: c.city,
      country: c.country,
      lifecycleStage: c.lifecycleStage as LifecycleStage,
      ownerId: c.ownerId,
      createdAt: c.node.createdAt,
      contacts: contacts.find((x) => x.companyId === c.nodeId)?._count ?? 0,
      openDeals: open.find((x) => x.companyId === c.nodeId)?._count ?? 0,
      revenue: Object.fromEntries(won.filter((w) => w.companyId === c.nodeId).map((w) => [w.currency, toNum(w._sum.amount)])),
      projectHealth: risk.get(c.nodeId) ?? null,
    })),
  };
}

export async function getCompany(userId: string, companyId: string) {
  return db.$transaction((tx) => getCompanyIn(tx, userId, companyId), { timeout: 20_000 });
}

export async function getCompanyIn(tx: Tx, userId: string, companyId: string) {
  const node = await loadCrmNode(tx, userId, companyId, "COMPANY");
  const c = await tx.company.findUniqueOrThrow({ where: { nodeId: companyId } });
  const now = new Date();
  const [contacts, deals, tags] = await Promise.all([
    tx.contact.findMany({ where: { companyId, node: { archivedAt: null } }, include: { node: { select: { title: true } } }, orderBy: { node: { createdAt: "asc" } } }),
    tx.deal.findMany({ where: { companyId, node: { archivedAt: null } }, include: { node: { select: { title: true, createdAt: true } }, stage: true }, orderBy: { node: { createdAt: "desc" } } }),
    tx.nodeTag.findMany({ where: { nodeId: companyId }, select: { tag: { select: { id: true, name: true, color: true } } } }),
  ]);
  const links = deals.length
    ? await tx.nodeLink.findMany({ where: { kind: "DEAL_PROJECT", fromNodeId: { in: deals.map((d) => d.nodeId) }, to: { archivedAt: null } }, select: { fromNodeId: true, to: { select: { id: true, title: true, progress: true, health: true, startDate: true, dueDate: true } } } })
    : [];
  const revenue: Record<string, number> = {};
  for (const d of deals) if (d.stage.isWon) revenue[d.currency] = (revenue[d.currency] ?? 0) + toNum(d.amount);
  const projects = links.map((l) => ({ ...l.to, dealId: l.fromNodeId }));
  const atRisk = projects.some((p) => p.health === "RED");
  return {
    id: node.id,
    legalName: c.legalName,
    website: c.website,
    industry: c.industry,
    size: c.size,
    country: c.country,
    city: c.city,
    address: c.address,
    taxId: c.taxId,
    source: c.source,
    ownerId: c.ownerId,
    lifecycleStage: c.lifecycleStage,
    customFields: c.customFields,
    createdAt: node.createdAt,
    tags: tags.map((t) => t.tag),
    revenue,
    atRisk,
    contacts: contacts.map((x) => ({ id: x.nodeId, name: x.node.title, position: x.position, emails: x.emails, phones: x.phones })),
    deals: deals.map((d) => ({
      id: d.nodeId,
      title: d.node.title,
      amount: toNum(d.amount),
      currency: d.currency,
      stage: d.stage.name,
      status: stageStatus(d.stage),
      probability: effectiveProbability(d.stage, d.probability),
      health: dealHealth({ status: stageStatus(d.stage), lastActivityAt: d.lastActivityAt, stageEnteredAt: d.stageEnteredAt, nextStep: d.nextStep, nextStepAt: d.nextStepAt, expectedCloseDate: d.expectedCloseDate }, now, { staleDays: STALE_DAYS, stuckDays: STUCK_DAYS }),
    })),
    projects,
    /** Hours logged on the client's projects. Time tracking UI arrives in Phase 4; entries already count. */
    hours: await clientHours(tx, projects.map((p) => p.id)),
  };
}

async function clientHours(tx: Tx, projectIds: string[]): Promise<{ total: number; billable: number; byProject: Record<string, number> }> {
  if (projectIds.length === 0) return { total: 0, billable: 0, byProject: {} };
  const rows = await tx.timeEntry.findMany({ where: { node: { OR: [{ id: { in: projectIds } }, { rootId: { in: projectIds } }] } }, select: { minutes: true, billable: true, node: { select: { id: true, rootId: true } } } });
  const byProject: Record<string, number> = {};
  let total = 0;
  let billable = 0;
  for (const r of rows) {
    const pid = r.node.rootId ?? r.node.id;
    byProject[pid] = (byProject[pid] ?? 0) + r.minutes / 60;
    total += r.minutes / 60;
    if (r.billable) billable += r.minutes / 60;
  }
  return { total, billable, byProject };
}

export async function companyDuplicateGroups(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const all = await db.company.findMany({ where: { workspaceId, node: { archivedAt: null } }, select: { nodeId: true, legalName: true, website: true, taxId: true } });
  return findDuplicateGroups(all.map((c) => ({ id: c.nodeId, ...c })), companyKeys).map((g) => g.map((c) => ({ id: c.id, legalName: c.legalName, website: c.website })));
}

