import { db } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { CHANNEL_LABEL } from "@/modules/crm/draft-links";
import { editAgentDraft, editDraftSchema, listAgentDrafts, markAgentDraftSent, rejectAgentDraft } from "@/server/services/crm/agent-drafts";
import { answerCallbackQuery, editTelegramMessage, sendTelegramMessage, telegramConfigured, type ReplyMarkup } from "./telegram-api";

/** What the bot says above each role's text. */
const TITLES: Record<string, string> = { morning_briefing: "🌅 Утренний брифинг", stale_followups: "⏰ Кому пора написать", evening_report: "🌙 Итог дня" };
/** More drafts than this in one run would bury the chat; the rest wait in the panel. */
const MAX_DRAFT_MESSAGES = 10;
const CHUNK = 3800;

/** A draft message carries its id in the last line, so a reply to it (or to the "edit" prompt) says which draft the new text is for. */
const MARK = /\[d:([a-z0-9]{20,32})\]/;
export const draftIdFrom = (text: string | undefined): string | null => (text ? (MARK.exec(text)?.[1] ?? null) : null);
const CALLBACK = /^ad:([tes]):([a-z0-9]{20,32})$/;

/** Cuts a long text at line breaks into pieces Telegram accepts. */
function chunks(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if (cur && cur.length + line.length + 1 > CHUNK) {
      out.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n${line}` : line;
    while (cur.length > CHUNK) {
      out.push(cur.slice(0, CHUNK));
      cur = cur.slice(CHUNK);
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function chatOf(userId: string, workspaceId: string): Promise<string | null> {
  const row = await db.userIntegration.findFirst({ where: { userId, workspaceId, kind: "TELEGRAM", externalId: { not: null } }, select: { externalId: true } });
  return row?.externalId ?? null;
}

interface DraftView {
  id: string;
  contactName: string;
  channel: keyof typeof CHANNEL_LABEL;
  text: string;
  reason: string | null;
  openUrl: string | null;
}

const draftMessage = (d: DraftView, note?: string) => `✉️ ${d.contactName} · ${CHANNEL_LABEL[d.channel]}${note ? ` (${note})` : ""}\n\n${d.text}${d.reason ? `\n\nПочему сегодня: ${d.reason}` : ""}\n\n[d:${d.id}]`;

function draftKeyboard(d: DraftView): ReplyMarkup {
  const rows = [[{ text: "Взял", callback_data: `ad:t:${d.id}` }, { text: "Изменить", callback_data: `ad:e:${d.id}` }, { text: "Пропустить", callback_data: `ad:s:${d.id}` }]];
  if (d.openUrl && /^https:\/\//.test(d.openUrl)) rows.push([{ text: `Открыть ${CHANNEL_LABEL[d.channel]}`, url: d.openUrl } as never]);
  return { inline_keyboard: rows };
}

/**
 * Sends what a scheduled run produced to the person's own Telegram chat: the text of the role, then every draft it saved as a message
 * of its own with the buttons "Взял", "Изменить" and "Пропустить". Nothing is sent when the bot is not set up or the person has not linked a chat.
 * `since` is the moment the run began: only the drafts it created are sent.
 */
export async function deliverAgentRun(o: { userId: string; workspaceId: string; role: string; output: string; since: Date }): Promise<{ delivered: boolean; messages: number }> {
  if (!telegramConfigured()) return { delivered: false, messages: 0 };
  const chat = await chatOf(o.userId, o.workspaceId);
  if (!chat) return { delivered: false, messages: 0 };

  let messages = 0;
  const title = TITLES[o.role] ?? "Агент";
  for (const [i, part] of chunks(o.output).entries()) {
    await sendTelegramMessage(chat, i === 0 ? `${title}\n\n${part}` : part);
    messages++;
  }
  const { items } = await listAgentDrafts(o.userId, o.workspaceId, { status: "PENDING" });
  for (const d of items.filter((x) => x.createdAt >= o.since).slice(0, MAX_DRAFT_MESSAGES)) {
    await sendTelegramMessage(chat, draftMessage(d), { replyMarkup: draftKeyboard(d) });
    messages++;
  }
  return { delivered: true, messages };
}

// ── what the person does in the chat ───────────────────────────────────────

export interface CallbackQuery {
  id: string;
  data?: string;
  message?: { message_id?: number; text?: string; chat?: { id?: number | string; type?: string } };
}

/** A chat is somebody's only when it was linked by them; anything else is ignored, so only the person the bot is linked to can act on drafts. */
async function linkedUser(chatId: string) {
  return db.userIntegration.findFirst({ where: { kind: "TELEGRAM", externalId: chatId }, orderBy: { createdAt: "asc" }, select: { userId: true, workspaceId: true } });
}

const reason = (e: unknown) => (e instanceof ApiError ? e.message : "Не получилось. Попробуйте ещё раз.");

/** A button under a draft: "Взял" logs the message as sent, "Пропустить" rejects it, "Изменить" asks for the new text. Never throws. */
export async function handleAgentCallback(cq: CallbackQuery): Promise<void> {
  const m = CALLBACK.exec(cq.data ?? "");
  const chatId = cq.message?.chat?.id !== undefined ? String(cq.message.chat.id) : null;
  const safe = (p: Promise<unknown>) => p.catch((e) => console.error("telegram agent reply failed", e));
  if (!m || !chatId || cq.message?.chat?.type !== "private") return void (await safe(answerCallbackQuery(cq.id)));
  const [, action, draftId] = m as unknown as [string, "t" | "e" | "s", string];

  const link = await linkedUser(chatId);
  if (!link) return void (await safe(answerCallbackQuery(cq.id, "Этот чат не привязан к MeetOwl.", true)));

  const settle = async (status: string) => {
    await safe(answerCallbackQuery(cq.id, status));
    if (cq.message?.message_id !== undefined && cq.message.text) await safe(editTelegramMessage(chatId, cq.message.message_id, `${cq.message.text.replace(MARK, "").trimEnd()}\n\n${status}`));
  };
  try {
    if (action === "t") {
      await markAgentDraftSent(link.userId, draftId);
      await settle("✅ Взял: записано в карточку контакта");
    } else if (action === "s") {
      await rejectAgentDraft(link.userId, draftId);
      await settle("⏭ Пропущено");
    } else {
      await safe(answerCallbackQuery(cq.id));
      await safe(sendTelegramMessage(chatId, `✏️ Пришлите новый текст ответом на это сообщение.\n\n[d:${draftId}]`, { replyMarkup: { force_reply: true, input_field_placeholder: "Новый текст сообщения" } }));
    }
  } catch (e) {
    await safe(answerCallbackQuery(cq.id, reason(e), true));
  }
}

/**
 * The person replied to a draft (or to the "edit" prompt) with new text: it replaces the draft's text, the draft counts as read and
 * approved, and the draft comes back with its buttons. Returns false when the reply is not about a draft, so other handlers may take it.
 */
export async function handleAgentReply(msg: { chatId: string; text: string; repliedText: string | undefined; repliedId?: number | undefined }): Promise<boolean> {
  const draftId = draftIdFrom(msg.repliedText);
  if (!draftId) return false;
  const safe = (p: Promise<unknown>) => p.catch((e) => console.error("telegram agent reply failed", e));
  const link = await linkedUser(msg.chatId);
  if (!link) return false;
  try {
    const parsed = editDraftSchema.safeParse({ text: msg.text });
    if (!parsed.success) throw new ApiError(422, "invalid_text", "Текст не подходит: он пустой или длиннее 4000 символов.");
    const saved = await editAgentDraft(link.userId, draftId, parsed.data);
    const { items } = await listAgentDrafts(link.userId, saved.workspaceId, { status: "APPROVED" });
    const view = items.find((d) => d.id === draftId);
    if (view) await sendTelegramMessage(msg.chatId, draftMessage(view, "изменён"), { replyMarkup: draftKeyboard(view) });
    // The message that was replied to must not keep buttons that would act on the old text.
    if (msg.repliedId !== undefined && msg.repliedText) await safe(editTelegramMessage(msg.chatId, msg.repliedId, `${msg.repliedText.replace(MARK, "").trimEnd()}\n\n✏️ Заменён новым текстом`));
  } catch (e) {
    await safe(sendTelegramMessage(msg.chatId, `Не получилось изменить: ${reason(e)}`));
  }
  return true;
}
