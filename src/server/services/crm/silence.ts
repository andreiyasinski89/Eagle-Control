import { db } from "@/server/db";
import { SILENCE_NORMS, compareSilence, evaluateSilence, type SilenceHit } from "@/modules/crm/silence";
import type { Stage } from "@/modules/crm/people";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { fullName } from "./common";

export interface SilentContact {
  contactId: string;
  name: string;
  stage: Stage;
  temperature: "HOT" | "WARM" | "COLD" | null;
  consentGiven: boolean;
  hit: SilenceHit;
  /** The newest thing logged on the contact, so a follow-up can start from it. */
  last: { type: string; subject: string; at: Date } | null;
}

const WATCHED: Stage[] = ["PRESENTATION", "DECIDING", "WARMING", "NO_REPLY", "DECLINED"];

/**
 * The person's own contacts whose silence timer has run out, most urgent first.
 * Contacts owned by someone else are never included, so each ambassador's agent sees only their own book.
 */
export async function findSilentContacts(userId: string, workspaceId: string, now = new Date()): Promise<SilentContact[]> {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const rows = await db.contact.findMany({
    where: { workspaceId, ownerId: userId, node: { archivedAt: null }, OR: [{ stage: { in: WATCHED } }, { repliedAt: { not: null } }] },
    select: { nodeId: true, firstName: true, lastName: true, stage: true, temperature: true, consentGiven: true, lastContactedAt: true, stageChangedAt: true, repliedAt: true },
  });
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.nodeId);

  const lead = SILENCE_NORMS.meetingLeadHours * 3_600_000;
  const meetings = await db.crmActivity.findMany({
    where: { workspaceId, contactId: { in: ids }, type: "MEETING", completedAt: null, dueAt: { gt: now, lte: new Date(now.getTime() + lead) } },
    select: { contactId: true, dueAt: true },
    orderBy: { dueAt: "asc" },
  });
  const nextMeeting = new Map<string, Date>();
  for (const m of meetings) if (m.contactId && m.dueAt && !nextMeeting.has(m.contactId)) nextMeeting.set(m.contactId, m.dueAt);

  const hits = rows.flatMap((r) => {
    const hit = evaluateSilence({ stage: r.stage, temperature: r.temperature, lastContactedAt: r.lastContactedAt, stageChangedAt: r.stageChangedAt, repliedAt: r.repliedAt, nextMeetingAt: nextMeeting.get(r.nodeId) ?? null }, now);
    return hit ? [{ r, hit }] : [];
  });
  if (hits.length === 0) return [];

  const latest = await db.crmActivity.findMany({
    where: { workspaceId, contactId: { in: hits.map((h) => h.r.nodeId) } },
    select: { contactId: true, type: true, subject: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    distinct: ["contactId"],
  });
  const last = new Map(latest.map((a) => [a.contactId as string, { type: a.type, subject: a.subject, at: a.createdAt }]));

  return hits
    .map(({ r, hit }) => ({ contactId: r.nodeId, name: fullName(r.firstName, r.lastName), stage: r.stage, temperature: r.temperature, consentGiven: r.consentGiven, hit, last: last.get(r.nodeId) ?? null }))
    .sort((a, b) => compareSilence(a, b));
}
