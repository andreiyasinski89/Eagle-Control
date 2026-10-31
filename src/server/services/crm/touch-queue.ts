import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { DECLINE_REASONS } from "@/modules/crm/decline";
import type { Stage } from "@/modules/crm/people";
import { cleanTouchSettings, OUTCOMES, orderQueue, planTouch, situationFor, type TouchSettings } from "@/modules/crm/touch";
import { addDays } from "@/modules/crm/tracker";
import { isValidTimeZone, todayIn, zonedParts, zonedToUtc } from "@/modules/views/tz";
import { loadWorkspaceMember, type Tx } from "@/server/services/nodes/access";
import { getOrCreateReferralLink } from "@/server/services/signup";
import { invalid, loadCrmNode } from "./common";
import { scriptLocale, shownText } from "./scripts";
import { updateContactIn } from "./contacts";
import { contactScope, dueBefore, withScope } from "./scope";
import { refreshTemperature } from "./temperature";

/** The people shown in one queue; the rest wait for the next one. */
const QUEUE_LIMIT = 300;
const DAY = 86_400_000;

async function zoneOf(userId: string): Promise<{ tz: string; locale: string | null; name: string }> {
  const me = await db.user.findUnique({ where: { id: userId }, select: { timezone: true, locale: true, name: true, firstName: true, email: true } });
  return { tz: me && isValidTimeZone(me.timezone) ? me.timezone : "UTC", locale: me?.locale ?? null, name: me?.firstName?.trim() || me?.name?.trim().split(/\s+/)[0] || me?.email.split("@")[0] || "" };
}

// ── Settings ───────────────────────────────────────────────────────

export const touchSettingsSchema = z.object({
  replyDays: z.number().int().min(1).max(3),
  noReplyDays: z.number().int().min(2).max(3),
  declineDays: z.number().int().min(60).max(90),
  meetingMovesStage: z.boolean(),
});

export async function getTouchSettings(userId: string, workspaceId: string): Promise<TouchSettings> {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  return cleanTouchSettings(m.touchSettings);
}

export async function saveTouchSettings(userId: string, workspaceId: string, input: z.infer<typeof touchSettingsSchema>): Promise<TouchSettings> {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const settings = cleanTouchSettings(input);
  await db.membership.update({ where: { userId_workspaceId: { userId, workspaceId } }, data: { touchSettings: settings as unknown as Prisma.InputJsonValue } });
  return settings;
}

// ── The queue ──────────────────────────────────────────────────────

const handle = (v: string | undefined | null) => (v ?? "").trim().replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "") || null;
const digits = (v: string | undefined | null) => ((v ?? "").replace(/\D/g, "").length >= 7 ? (v ?? "").replace(/\D/g, "") : null);

/**
 * The people whose turn it is, one card each, in the order to go through them: late first, then the hottest, then those closest to a decision.
 * A card holds what is needed to write to the person without opening anything else: how they are, the last three things that happened,
 * how to reach them, and the words ready for this moment. Only the people the member keeps are in it.
 */
export async function getTouchQueue(userId: string, workspaceId: string, now = new Date(), locale?: string | null) {
  const member = await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const { tz, name: myName } = await zoneOf(userId);
  const today = todayIn(tz, now);
  const dayEnd = zonedToUtc(addDays(today, 1), "00:00", tz);
  const scope = await contactScope(db, member);
  const rows = await db.contact.findMany({
    where: withScope({ workspaceId, ownerId: userId, node: { archivedAt: null }, ...dueBefore(dayEnd) }, scope),
    orderBy: [{ nextStepAt: { sort: "asc", nulls: "last" } }, { firstName: "asc" }],
    take: QUEUE_LIMIT,
    include: { company: { select: { legalName: true } } },
  });
  const ids = rows.map((r) => r.nodeId);
  const acts = ids.length
    ? await db.crmActivity.findMany({
        where: { contactId: { in: ids }, OR: [{ completedAt: { not: null } }, { type: { in: ["MEETING", "CALL"] }, dueAt: { gte: now } }] },
        orderBy: [{ createdAt: "desc" }],
        take: ids.length * 6,
        select: { id: true, contactId: true, type: true, subject: true, body: true, outcome: true, completedAt: true, dueAt: true, createdAt: true },
      })
    : [];
  const byContact = new Map<string, typeof acts>();
  for (const a of acts) if (a.contactId) byContact.set(a.contactId, [...(byContact.get(a.contactId) ?? []), a]);

  const dayOf = (d: Date | null) => (d ? zonedParts(d, tz).day : null);
  const items = rows.map((c) => {
    const list = byContact.get(c.nodeId) ?? [];
    const quiet = c.stage === "DECLINED" || c.stage === "NO_REPLY";
    const day = dayOf(quiet ? c.returnAt : c.nextStepAt);
    const lastOutcome = list.find((a) => a.outcome)?.outcome ?? null;
    const meetingHeld = list.some((a) => a.type === "MEETING" && a.completedAt && now.getTime() - a.completedAt.getTime() <= 60 * DAY);
    const m = c.messengers as Record<string, string>;
    return {
      id: c.nodeId,
      name: [c.firstName, c.lastName].filter(Boolean).join(" "),
      firstName: c.firstName,
      stage: c.stage as Stage,
      temperature: c.temperature,
      source: c.source,
      position: c.position,
      companyName: c.company?.legalName ?? null,
      city: c.city,
      country: c.country,
      lastContactedAt: c.lastContactedAt,
      nextStep: c.nextStep,
      day,
      overdue: !!day && day < today,
      situation: situationFor({ stage: c.stage as Stage, lastOutcome, meetingHeld }),
      lastOutcome,
      telegram: handle(m.telegram),
      whatsapp: digits(m.whatsapp) ?? digits(c.phones[0]),
      phone: c.phones[0] ?? null,
      // As typed: the buttons of the messengers decide what to open from these (a number without its country code opens no chat).
      phones: c.phones,
      messengers: m,
      recent: list.slice(0, 3).map((a) => ({ id: a.id, type: a.type, subject: a.subject, body: a.body, outcome: a.outcome, at: a.completedAt ?? a.dueAt ?? a.createdAt })),
    };
  });
  const ordered = orderQueue(items.map((i) => ({ ...i, day: i.day })));

  const [scripts, link] = await Promise.all([
    db.script.findMany({ where: { workspaceId, OR: [{ ownerId: null }, { ownerId: userId }] }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, title: true, stage: true, situation: true, body: true, ownerId: true, starterKey: true } }),
    getOrCreateReferralLink(userId, workspaceId).then((l) => l.url).catch(() => null),
  ]);
  const lang = await scriptLocale(userId, locale);
  return {
    date: today,
    total: ordered.length,
    truncated: rows.length >= QUEUE_LIMIT,
    items: ordered,
    scripts: scripts.map((s) => ({ id: s.id, ...shownText(s, lang), stage: s.stage, situation: s.situation, shared: s.ownerId === null })),
    me: { name: myName, link },
    settings: cleanTouchSettings(member.touchSettings),
  };
}

// ── A result ───────────────────────────────────────────────────────

export const touchResultSchema = z.object({
  outcome: z.enum(OUTCOMES),
  /** The text that was sent, kept with the touch. */
  message: z.string().trim().max(4000).optional(),
  channel: z.enum(["telegram", "whatsapp", "instagram", "copy", "call"]).optional(),
  /** For a meeting that was set: when. */
  meetingAt: z.string().datetime().optional(),
  durationMin: z.number().int().min(5).max(480).optional(),
  /** For a no: why. */
  declineReason: z.enum(DECLINE_REASONS).optional(),
  signals: z.array(z.enum(["PRICE_QUESTION"])).max(3).optional(),
  /** The language of the screen the person works in: the words written into the feed and the next step follow it. */
  locale: z.enum(["ru", "en", "pl", "uk"]).optional(),
});

const SUBJECT: Record<string, Record<string, string>> = {
  ru: { REPLIED: "Касание: ответил(а)", NO_REPLY: "Касание: без ответа", MEETING_SET: "Касание: назначена встреча", DECLINED: "Касание: отказ", meeting: "Встреча" },
  en: { REPLIED: "Touch: replied", NO_REPLY: "Touch: no reply", MEETING_SET: "Touch: meeting set", DECLINED: "Touch: said no", meeting: "Meeting" },
  pl: { REPLIED: "Kontakt: odpowiedział(a)", NO_REPLY: "Kontakt: brak odpowiedzi", MEETING_SET: "Kontakt: umówione spotkanie", DECLINED: "Kontakt: odmowa", meeting: "Spotkanie" },
  uk: { REPLIED: "Дотик: відповів(ла)", NO_REPLY: "Дотик: без відповіді", MEETING_SET: "Дотик: призначено зустріч", DECLINED: "Дотик: відмова", meeting: "Зустріч" },
};

/**
 * Writes down what came of a touch, in one go: the touch in the person's feed, the new next step with a text that says what to do, the stage when it
 * changes, the day to come back for someone who said no or went quiet, a meeting in the calendar when one was set, and a fresh temperature.
 */
export async function recordTouchResult(userId: string, contactId: string, input: z.infer<typeof touchResultSchema>, now = new Date()) {
  const { tz, locale: saved } = await zoneOf(userId);
  const locale = input.locale ?? saved;
  const today = todayIn(tz, now);
  return db.$transaction(async (tx) => {
    const node = await loadCrmNode(tx, userId, contactId, "CONTACT", true);
    const member = await loadWorkspaceMember(tx, userId, node.workspaceId, "crm:write");
    const c = await tx.contact.findUniqueOrThrow({ where: { nodeId: contactId } });
    if (input.outcome === "MEETING_SET" && !input.meetingAt) throw invalid("missing_meeting", "Say when the meeting is");
    if (input.outcome === "DECLINED" && !input.declineReason) throw invalid("missing_reason", "Say why the person said no");

    const unanswered = input.outcome === "NO_REPLY" ? await unansweredInRow(tx, contactId) + 1 : 0;
    const plan = planTouch({
      outcome: input.outcome,
      stage: c.stage as Stage,
      today,
      settings: cleanTouchSettings(member.touchSettings),
      unansweredInRow: unanswered,
      meetingDay: input.meetingAt ? zonedParts(new Date(input.meetingAt), tz).day : undefined,
      locale,
    });
    const words = SUBJECT[locale === "ru" || locale === "pl" || locale === "uk" ? locale : "en"] as Record<string, string>;
    const touch = await tx.crmActivity.create({
      data: {
        workspaceId: node.workspaceId,
        type: input.channel === "call" ? "CALL" : "MESSAGE",
        subject: words[input.outcome] as string,
        body: input.message || null,
        ownerId: userId,
        contactId,
        dueAt: now,
        completedAt: now,
        outcome: input.outcome,
        signals: input.signals ?? [],
      },
    });
    if (input.outcome === "MEETING_SET") {
      await tx.crmActivity.create({
        data: { workspaceId: node.workspaceId, type: "MEETING", subject: `${words.meeting}: ${[c.firstName, c.lastName].filter(Boolean).join(" ")}`, ownerId: userId, contactId, dueAt: new Date(input.meetingAt as string), durationMin: input.durationMin ?? 30 },
      });
    }
    // The stage and the next step go through the same door as every other change to a person: the stage event, the guards, the temperature.
    await updateContactIn(tx, userId, contactId, {
      ...(plan.stage && plan.stage !== c.stage ? { stage: plan.stage } : {}),
      nextStep: plan.nextStep,
      nextStepAt: `${plan.day}T00:00:00.000Z`,
      ...(input.outcome === "DECLINED" ? { declineReason: input.declineReason } : {}),
    });
    await tx.contact.update({ where: { nodeId: contactId }, data: { lastContactedAt: now, returnAt: plan.returnAt ? new Date(`${plan.returnAt}T00:00:00.000Z`) : null } });
    const temperature = await refreshTemperature(tx, contactId, now);
    return { activityId: touch.id, outcome: input.outcome, stage: plan.stage ?? c.stage, nextStep: plan.nextStep, nextStepAt: `${plan.day}T00:00:00.000Z`, returnAt: plan.returnAt ?? null, cooled: plan.cooled, temperature };
  });
}

/** How many touches in a row, the latest first, went without an answer. A touch with no recorded result stops the count. */
async function unansweredInRow(tx: Tx, contactId: string): Promise<number> {
  const last = await tx.crmActivity.findMany({ where: { contactId, outcome: { not: null } }, orderBy: { completedAt: { sort: "desc", nulls: "last" } }, take: 10, select: { outcome: true } });
  let n = 0;
  for (const a of last) {
    if (a.outcome !== "NO_REPLY") break;
    n++;
  }
  return n;
}
