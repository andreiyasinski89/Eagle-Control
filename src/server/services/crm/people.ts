import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { contactKeys } from "@/modules/crm/dedupe";
import { PRIORITIES, STAGES, TEMPERATURES } from "@/modules/crm/people";
import { descendantIds } from "@/modules/crm/groups";
import { splitFullName } from "@/modules/crm/csv";
import { isValidTimeZone, todayIn, zonedToUtc } from "@/modules/views/tz";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { assertWorkspaceMember, fullName } from "./common";
import { assertContactCapacity, contactWhere, createContactsBulk, priorityField } from "./contacts";
import { assertGroup } from "./groups";
import { contactScope, withScope } from "./scope";

const DAY = 86_400_000;
const text = (max: number) => z.string().trim().max(max).nullable().optional();

export const listPeopleSchema = z.object({
  q: z.string().trim().max(100).optional(),
  ownerId: z.string().optional(),
  temperature: z.enum(TEMPERATURES).optional(),
  source: z.string().trim().max(80).optional(),
  priority: z.enum(PRIORITIES).optional(),
  /** A group id (its subgroups count too), or "none" for people in no group. */
  group: z.string().max(40).optional(),
  /** A partner id: only the people that partner holds; "none": people nobody holds; "any": people held by any partner. */
  held: z.string().max(40).optional(),
  /** "1": only those whose next step is due today or is already late. */
  due: z.enum(["0", "1"]).default("0"),
});

const BOARD_LIMIT = 1500;

/**
 * Everyone in the funnel, light enough to draw as a board: a person is a card in the column of their stage.
 * The filters narrow what is drawn; `totals.all` is how many people the workspace holds whatever the filters say.
 */
export async function listPeople(userId: string, workspaceId: string, f: z.infer<typeof listPeopleSchema>, now = new Date()) {
  const member = await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const scope = await contactScope(db, member);
  const me = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const tz = me && isValidTimeZone(me.timezone) ? me.timezone : "UTC";
  const today = todayIn(tz, now);
  const endOfToday = zonedToUtc(new Date(new Date(`${today}T00:00:00.000Z`).getTime() + DAY).toISOString().slice(0, 10), "00:00", tz);

  const base = contactWhere(workspaceId, { q: f.q, ownerId: f.ownerId, temperature: f.temperature });
  let groupWhere: Prisma.ContactWhereInput = {};
  if (f.group === "none") groupWhere = { groupId: null };
  else if (f.group) groupWhere = { groupId: { in: descendantIds(await db.contactGroup.findMany({ where: { workspaceId }, select: { id: true, parentId: true } }), f.group) } };
  const heldWhere: Prisma.ContactWhereInput = f.held === "none" ? { heldById: null } : f.held === "any" ? { heldById: { not: null } } : f.held ? { heldById: f.held } : {};
  const where: Prisma.ContactWhereInput = withScope({ ...base, ...groupWhere, ...heldWhere, ...(f.source ? { source: f.source } : {}), ...(f.priority ? { typeTag: f.priority } : {}), ...(f.due === "1" ? { nextStepAt: { lt: endOfToday }, stage: { notIn: ["DECLINED", "NO_REPLY"] } } : {}) }, scope);
  const [all, rows] = await Promise.all([
    db.contact.count({ where: withScope({ workspaceId, node: { archivedAt: null } }, scope) }),
    db.contact.findMany({
      where,
      orderBy: [{ nextStepAt: { sort: "asc", nulls: "last" } }, { firstName: "asc" }],
      take: BOARD_LIMIT + 1,
      include: { company: { select: { legalName: true } } },
    }),
  ]);
  const truncated = rows.length > BOARD_LIMIT;
  const items = rows.slice(0, BOARD_LIMIT).map((c) => {
    const m = c.messengers as Record<string, string>;
    return {
      id: c.nodeId,
      name: fullName(c.firstName, c.lastName),
      stage: c.stage,
      stageChangedAt: c.stageChangedAt,
      temperature: c.temperature,
      source: c.source,
      interests: c.interests,
      influence: c.influence,
      nextStep: c.nextStep,
      nextStepAt: c.nextStepAt,
      typeTag: c.typeTag,
      country: c.country,
      groupId: c.groupId,
      heldById: c.heldById,
      ownerId: c.ownerId,
      companyName: c.company?.legalName ?? null,
      lastContactedAt: c.lastContactedAt,
      telegram: m.telegram ?? null,
      phone: c.phones[0] ?? null,
      email: c.emails[0] ?? null,
    };
  });
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<(typeof STAGES)[number], number>;
  for (const i of items) counts[i.stage]++;
  return { items, counts, truncated, totals: { all, shown: items.length, dueToday: items.filter((i) => i.nextStepAt && i.nextStepAt < endOfToday && i.stage !== "DECLINED" && i.stage !== "NO_REPLY").length }, today };
}

export const addPeopleSchema = z.object({
  people: z
    .array(z.object({ name: z.string().trim().min(1).max(100), telegram: z.string().trim().max(100).optional(), phone: z.string().trim().max(40).optional(), note: z.string().trim().max(500).optional() }))
    .min(1)
    .max(300),
  /** What every person of the list starts with. */
  stage: z.enum(STAGES).default("NEW"),
  temperature: z.enum(TEMPERATURES).nullable().optional(),
  source: text(80),
  interests: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  country: text(80),
  typeTag: priorityField,
  sponsorName: text(120),
  groupId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
});

/**
 * Puts a pasted list of names into the funnel in one go. A person who is already there (same name, or same phone) is not added
 * twice: they are reported back as skipped, so the list can be pasted again after editing it without making doubles.
 */
export async function addPeople(userId: string, workspaceId: string, input: z.infer<typeof addPeopleSchema>) {
  return db.$transaction(
    async (tx) => {
      await loadWorkspaceMember(tx, userId, workspaceId, "crm:write");
      await assertWorkspaceMember(tx, workspaceId, input.ownerId);
      await assertGroup(tx, workspaceId, input.groupId);
      const existing = new Set<string>();
      for (const c of await tx.contact.findMany({ where: { workspaceId, node: { archivedAt: null } }, select: { firstName: true, lastName: true, emails: true, phones: true } })) for (const k of contactKeys(c)) existing.add(k);

      const fresh: typeof input.people = [];
      const skipped: string[] = [];
      for (const p of input.people) {
        const { firstName, lastName } = splitFullName(p.name);
        const keys = contactKeys({ emails: [], phones: p.phone ? [p.phone] : [], firstName, lastName });
        if (keys.some((k) => existing.has(k))) {
          skipped.push(p.name);
          continue;
        }
        for (const k of keys) existing.add(k);
        fresh.push(p);
      }
      await assertContactCapacity(tx, workspaceId, fresh.length);
      const ids = await createContactsBulk(
        tx,
        userId,
        workspaceId,
        fresh.map((p) => {
          const { firstName, lastName } = splitFullName(p.name);
          return {
            firstName,
            lastName,
            position: null,
            emails: [],
            phones: p.phone ? [p.phone] : [],
            messengers: (p.telegram ? { telegram: p.telegram } : {}) as Record<string, string>,
            note: p.note ?? null,
            funnel: { stage: input.stage, temperature: input.temperature, source: input.source, interests: input.interests, country: input.country, typeTag: input.typeTag, sponsorName: input.sponsorName, groupId: input.groupId, ownerId: input.ownerId ?? userId },
          };
        }),
      );
      return { created: ids.length, skipped, ids };
    },
    { timeout: 60_000, maxWait: 30_000 },
  );
}
