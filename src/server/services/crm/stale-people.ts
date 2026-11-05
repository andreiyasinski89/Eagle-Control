import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import type { Stage } from "@/modules/crm/people";
import { cleanTouchSettings } from "@/modules/crm/touch";
import { isValidTimeZone, zonedParts } from "@/modules/views/tz";
import { deliverPending, notify } from "@/server/services/notify";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { fullName } from "./common";
import { contactScope, withScope } from "./scope";

/** The stages in which a person is being worked with: a name never written to, and the ones who said no or went quiet, are not "people we lost touch with". */
export const STALE_STAGES: Stage[] = ["FIRST_CONTACT", "WARMING", "PRESENTATION", "DECIDING", "CLIENT"];

const DAY = 86_400_000;
/** The hour of the person's own day from which the reminder may come, and the names listed in one message (the rest stay for the next days). */
export const REMIND_FROM_HOUR = 9;
export const REMIND_NAMES = 10;

export interface StalePerson {
  id: string;
  name: string;
  stage: Stage;
  temperature: string | null;
  /** Days since the last touch (or since the person came into the stage, if there was none). */
  days: number;
}

const TEMP_RANK: Record<string, number> = { HOT: 0, WARM: 1, COLD: 2 };

/**
 * People the member works with who have no date set and have not been touched for the number of days chosen in their settings.
 * Those with a date are in the list (or will be on their day), so they are not "forgotten"; those who rest (said no, went quiet) have their own day to return.
 * Hottest first, then those silent the longest.
 */
export async function staleFilter(userId: string, workspaceId: string, now = new Date()): Promise<Prisma.ContactWhereInput> {
  const member = await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const staleDays = cleanTouchSettings(member.touchSettings).staleDays;
  const cutoff = new Date(now.getTime() - staleDays * DAY);
  const scope = await contactScope(db, member);
  return withScope(
    {
      workspaceId,
      ownerId: userId,
      node: { archivedAt: null },
      stage: { in: STALE_STAGES },
      nextStepAt: null,
      OR: [{ lastContactedAt: { lt: cutoff } }, { lastContactedAt: null, stageChangedAt: { lt: cutoff } }],
    },
    scope,
  );
}

export async function findStalePeople(userId: string, workspaceId: string, now = new Date()): Promise<StalePerson[]> {
  const rows = await db.contact.findMany({
    where: await staleFilter(userId, workspaceId, now),
    select: { nodeId: true, firstName: true, lastName: true, stage: true, temperature: true, lastContactedAt: true, stageChangedAt: true },
    take: 1000,
  });
  return rows
    .map((r) => ({ id: r.nodeId, name: fullName(r.firstName, r.lastName), stage: r.stage as Stage, temperature: r.temperature as string | null, days: Math.floor((now.getTime() - (r.lastContactedAt ?? r.stageChangedAt).getTime()) / DAY) }))
    .sort((a, b) => (TEMP_RANK[a.temperature ?? ""] ?? 3) - (TEMP_RANK[b.temperature ?? ""] ?? 3) || b.days - a.days || a.name.localeCompare(b.name));
}

type Lang = "ru" | "en" | "pl" | "uk";
const lang = (l: string | null | undefined): Lang => (l === "ru" || l === "pl" || l === "uk" ? l : "en");

const WORDS: Record<Lang, { title: (n: number) => string; d: string; more: (n: number) => string; open: string }> = {
  ru: { title: (n) => `Давно не связывались: ${n}`, d: "дн.", more: (n) => `…и ещё ${n} в списке`, open: "Открыть список" },
  en: { title: (n) => `Out of touch for a while: ${n}`, d: "d", more: (n) => `…and ${n} more in the list`, open: "Open the list" },
  pl: { title: (n) => `Dawno bez kontaktu: ${n}`, d: "dni", more: (n) => `…i jeszcze ${n} na liście`, open: "Otwórz listę" },
  uk: { title: (n) => `Давно не зв'язувалися: ${n}`, d: "дн.", more: (n) => `…і ще ${n} у списку`, open: "Відкрити список" },
};

/** The text of one reminder: how many people, the first few by name with the days of silence, and how many more are in the list. */
export function staleMessage(people: StalePerson[], total: number, locale: string | null | undefined): { title: string; body: string } {
  const w = WORDS[lang(locale)];
  const lines = people.map((p) => `• ${p.name} — ${p.days} ${w.d}`);
  if (total > people.length) lines.push(w.more(total - people.length));
  return { title: w.title(total), body: lines.join("\n") };
}

/**
 * One reminder a day to each member, from the morning of their own day: who they have not been in touch with for long and gave no date to.
 * Each person is named once per stretch of silence (the days chosen in the settings): the people already named in an earlier reminder of this stretch
 * are left out, so the same names do not come back every day, and a long list is told in portions of ten.
 * Goes to the in-app bell and, when the member has connected Telegram, to the bot; the outbox is drained at once.
 */
export async function dispatchStalePeople(now = new Date()): Promise<{ members: number; reminded: number }> {
  const members = await db.membership.findMany({ where: { role: { in: ["OWNER", "ADMIN", "MEMBER"] } }, select: { userId: true, workspaceId: true, touchSettings: true } });
  let sent = 0;
  let people = 0;
  for (const m of members) {
    try {
      const me = await db.user.findUnique({ where: { id: m.userId }, select: { timezone: true, locale: true, deletedAt: true, suspendedAt: true } });
      if (!me || me.deletedAt || me.suspendedAt) continue;
      const tz = isValidTimeZone(me.timezone) ? me.timezone : "UTC";
      const here = zonedParts(now, tz);
      if (here.minutes < REMIND_FROM_HOUR * 60) continue;
      const all = await findStalePeople(m.userId, m.workspaceId, now);
      if (all.length === 0) continue;
      const staleDays = cleanTouchSettings(m.touchSettings).staleDays;
      const since = new Date(now.getTime() - staleDays * DAY);
      // The reminders of the last weeks are read for the people they named; each carries the moment it was made, so the count is by that moment.
      const earlier = await db.notification.findMany({ where: { userId: m.userId, workspaceId: m.workspaceId, kind: "stale_people" }, orderBy: { createdAt: "desc" }, take: 100, select: { payload: true, createdAt: true } });
      const named = new Set(
        earlier
          .filter((n) => new Date((n.payload as { sentAt?: string } | null)?.sentAt ?? n.createdAt) >= since)
          .flatMap((n) => ((n.payload as { ids?: string[] } | null)?.ids ?? []) as string[]),
      );
      const fresh = all.filter((p) => !named.has(p.id));
      if (fresh.length === 0) continue;
      const shown = fresh.slice(0, REMIND_NAMES);
      const text = staleMessage(shown, fresh.length, me.locale);
      const id = await notify({ userId: m.userId, workspaceId: m.workspaceId, kind: "stale_people", title: text.title, body: text.body, url: "/crm/touches?stale=1", dedupeKey: `stale_people:${m.userId}:${m.workspaceId}:${here.day}`, payload: { ids: shown.map((p) => p.id), sentAt: now.toISOString() } });
      if (id) {
        sent++;
        people += shown.length;
      }
    } catch (e) {
      console.error("stale-people reminder failed", e instanceof Error ? e.message : e);
    }
  }
  if (sent) await deliverPending().catch((e) => console.error("stale-people delivery failed", e instanceof Error ? e.message : e));
  return { members: sent, reminded: people };
}
