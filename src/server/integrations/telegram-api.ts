import { env } from "@/lib/env";
import { httpJson, notConfigured } from "./common";

const TEXT_LIMIT = 3900; // Telegram allows 4096 characters per message

export const telegramConfigured = () => !!env().TELEGRAM_BOT_TOKEN && !!env().TELEGRAM_WEBHOOK_SECRET;

/** Inline keyboard, or an instruction to answer with a reply (Telegram's own shapes, passed through). */
export type ReplyMarkup = { inline_keyboard: { text: string; callback_data?: string; url?: string }[][] } | { force_reply: true; input_field_placeholder?: string };

async function call<T>(method: string, json: Record<string, unknown>): Promise<T> {
  const token = env().TELEGRAM_BOT_TOKEN;
  if (!token) throw notConfigured("Telegram");
  return httpJson<T>("telegram", `https://api.telegram.org/bot${token}/${method}`, { method: "POST", json });
}

/** Sends a plain-text message (no parse mode, so nothing in the text can be taken for markup). Returns Telegram's id of the message. */
export async function sendTelegramMessage(chatId: string, text: string, opts: { replyMarkup?: ReplyMarkup } = {}): Promise<number | null> {
  const r = await call<{ result?: { message_id?: number } }>("sendMessage", { chat_id: chatId, text: text.slice(0, TEXT_LIMIT), disable_web_page_preview: true, ...(opts.replyMarkup ? { reply_markup: opts.replyMarkup } : {}) });
  return r?.result?.message_id ?? null;
}

/** One bot for the whole installation; every person links their own chat to it. */
export async function sendTelegram(chatId: string, text: string): Promise<void> {
  await sendTelegramMessage(chatId, text);
}

/** Replaces the text of a message the bot sent; an empty keyboard takes its buttons away. */
export async function editTelegramMessage(chatId: string, messageId: number, text: string, replyMarkup: ReplyMarkup = { inline_keyboard: [] }): Promise<void> {
  await call("editMessageText", { chat_id: chatId, message_id: messageId, text: text.slice(0, TEXT_LIMIT), disable_web_page_preview: true, reply_markup: replyMarkup });
}

/** Closes the "loading" state of a pressed button; with `alert` the text is shown as a dialog instead of a toast. */
export async function answerCallbackQuery(id: string, text?: string, alert = false): Promise<void> {
  await call("answerCallbackQuery", { callback_query_id: id, ...(text ? { text: text.slice(0, 200), show_alert: alert } : {}) });
}
