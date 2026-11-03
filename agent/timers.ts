import { SILENCE_ACTION, SILENCE_NORMS } from "@/modules/crm/silence";
import { findSilentContacts, type SilentContact } from "@/server/services/crm/silence";

/** More rows than this would only crowd the prompt; the role is told how many were left out. */
const MAX_ROWS = 30;

const day = (d: Date) => d.toISOString().slice(0, 10);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function silence(c: SilentContact): string {
  if (c.hit.kind === "meeting_soon") return `встреча в ${c.hit.since.toISOString().slice(11, 16)} UTC`;
  const d = Math.floor(c.hit.silentHours / 24);
  return d >= 1 ? `${d} дн.` : `${c.hit.silentHours} ч.`;
}

/** The `{timers_table}` of the follow-up role: one line per contact, with the last thing that happened. */
export function renderTimersTable(items: SilentContact[]): string {
  if (items.length === 0) return "таких контактов нет";
  const rows = items.slice(0, MAX_ROWS).map((c) => {
    const last = c.last ? `${c.last.type} ${day(c.last.at)} «${clip(c.last.subject, 60)}»` : "истории нет";
    const consent = c.consentGiven ? "согласие есть" : "нужно согласие";
    return `- ${c.name} [id ${c.contactId}] | ${c.stage}${c.temperature ? `, ${c.temperature}` : ""} | тишина ${silence(c)} | ${SILENCE_ACTION[c.hit.kind]} | последнее: ${last} | ${consent}`;
  });
  const rest = items.length - MAX_ROWS;
  return [`Норма: ответил — ${SILENCE_NORMS.repliedHours} ч, DECIDING — ${SILENCE_NORMS.stageDays.DECIDING} дн., WARMING — ${SILENCE_NORMS.stageDays.WARMING} дн., NO_REPLY — ${SILENCE_NORMS.stageDays.NO_REPLY} дн., DECLINED — ${SILENCE_NORMS.stageDays.DECLINED} дн.`, `Найдено: ${items.length}`, ...rows, ...(rest > 0 ? [`…и ещё ${rest} (покажи числом)`] : [])].join("\n");
}

export async function timersTableFor(userId: string, workspaceId: string, now = new Date()): Promise<{ table: string; count: number }> {
  const items = await findSilentContacts(userId, workspaceId, now);
  return { table: renderTimersTable(items), count: items.length };
}
