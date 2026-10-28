import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { ApiError, notFound } from "@/server/http/errors";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { createNode, completeNode, transact } from "@/server/services/nodes/ops";
import { getTree, listProjects } from "@/server/services/nodes/queries";
import { getMyDay } from "@/server/services/crm/my-day";
import { ingestLead } from "@/server/services/crm/lead-ingest";
import { registerChannel, type ChannelAdapter } from "@/server/services/notify";
import { appUrl, httpJson, notConfigured, requireIntegrations, safeEqual, sha256 } from "./common";

const CODE_TTL_MS = 15 * 60_000;
const TEXT_LIMIT = 3900; // Telegram allows 4096 characters per message

export const telegramConfigured = () => !!env().TELEGRAM_BOT_TOKEN && !!env().TELEGRAM_WEBHOOK_SECRET;

/** One bot for the whole installation; every person links their own chat to it. */
export async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = env().TELEGRAM_BOT_TOKEN;
  if (!token) throw notConfigured("Telegram");
  await httpJson("telegram", `https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", json: { chat_id: chatId, text: text.slice(0, TEXT_LIMIT), disable_web_page_preview: true } });
}

// ── linking ────────────────────────────────────────────────────────────────

interface TelegramConfig {
  pending?: { hash: string; expiresAt: string } | null;
  /** Task ids shown by the last /today, so "/done 2" means the same task the person saw. */
  lastToday?: string[];
  inboxProjectId?: string | null;
}

/** Starts linking: the person sends `/start <code>` to the bot from the chat they want to use. */
export async function createLinkCode(userId: string, workspaceId: string, now = new Date()) {
  await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  await requireIntegrations(workspaceId);
  if (!telegramConfigured()) throw notConfigured("Telegram");
  const code = randomBytes(5).toString("hex");
  const pending = { hash: sha256(code), expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString() };
  const existing = await db.userIntegration.findFirst({ where: { userId, kind: "TELEGRAM", workspaceId } });
  const config = { ...((existing?.config as TelegramConfig | null) ?? {}), pending } as Prisma.InputJsonValue;
  if (existing) await db.userIntegration.update({ where: { id: existing.id }, data: { config } });
  else await db.userIntegration.create({ data: { userId, workspaceId, kind: "TELEGRAM", config } });
  const bot = env().TELEGRAM_BOT_USERNAME;
  return { code, expiresAt: pending.expiresAt, url: bot ? `https://t.me/${bot}?start=${code}` : null, bot: bot || null };
}

/** Where Telegram must send this bot's messages. */
export const telegramWebhookUrl = () => `${appUrl()}/api/integrations/telegram/webhook`;

export interface WebhookState {
  /** Telegram sends the bot's messages to this installation. */
  ok: boolean;
  /** The address Telegram has now (empty when none), and the last delivery error it reports. */
  url: string | null;
  lastError: string | null;
}

/** Asks Telegram where the bot's messages go. A failure to ask is "unknown" (null), not "not registered". */
async function webhookState(): Promise<WebhookState | null> {
  const token = env().TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const info = await httpJson<{ result?: { url?: string; last_error_message?: string } }>("telegram", `https://api.telegram.org/bot${token}/getWebhookInfo`, { timeoutMs: 4_000 });
    const url = info.result?.url || null;
    return { ok: url === telegramWebhookUrl(), url, lastError: info.result?.last_error_message ?? null };
  } catch {
    return null;
  }
}

export async function telegramStatus(userId: string, workspaceId: string) {
  const row = await db.userIntegration.findFirst({ where: { userId, kind: "TELEGRAM", workspaceId } });
  const configured = telegramConfigured();
  return { configured, linked: !!row?.externalId, chatName: (row?.config as { chatName?: string } | null)?.chatName ?? null, webhook: configured ? await webhookState() : null };
}

/**
 * Tells Telegram to send the bot's messages to this installation, with the secret that later proves a call is Telegram's.
 * Replaces the one-time `setWebhook` command by hand. Safe to repeat. The bot is shared by the whole installation, so this is the
 * platform owner's act and nobody else's: whoever calls it must already have been checked as the platform owner.
 */
export async function setTelegramWebhook(): Promise<{ url: string }> {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret } = env();
  if (!token || !secret) throw notConfigured("Telegram");
  const url = telegramWebhookUrl();
  if (!url.startsWith("https://")) throw new ApiError(422, "https_required", "Telegram only delivers to https addresses. Set APP_URL to the public https address of this installation.");
  await httpJson("telegram", `https://api.telegram.org/bot${token}/setWebhook`, { method: "POST", json: { url, secret_token: secret, allowed_updates: ["message"] } });
  return { url };
}

/** Asks Telegram who the bot is: proves the token is a real one. Null when Telegram could not be asked or refused the token. */
export async function telegramBotCheck(): Promise<{ username: string | null } | null> {
  const token = env().TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const me = await httpJson<{ result?: { username?: string } }>("telegram", `https://api.telegram.org/bot${token}/getMe`, { timeoutMs: 5_000 });
    return { username: me.result?.username ?? null };
  } catch {
    return null;
  }
}

export { webhookState as telegramWebhookState };

export async function disconnectTelegram(userId: string, workspaceId: string): Promise<void> {
  const row = await db.userIntegration.findFirst({ where: { userId, kind: "TELEGRAM", workspaceId } });
  if (!row) return;
  if (row.externalId && telegramConfigured()) await sendTelegram(row.externalId, "MeetOwl is disconnected from this chat.").catch(() => undefined);
  await db.userIntegration.delete({ where: { id: row.id } });
}

// ── incoming messages ──────────────────────────────────────────────────────

/** Telegram proves a webhook call with the secret we gave it when registering the webhook. */
export function verifyTelegramSecret(header: string | null): boolean {
  const secret = env().TELEGRAM_WEBHOOK_SECRET;
  return !!secret && !!header && safeEqual(header, secret);
}

interface Update {
  message?: { text?: string; chat?: { id?: number | string; type?: string; first_name?: string; username?: string } };
}

const HELP = ["/today – what is due today", "/task <title> – add a task for me", "/done <n> – finish task n from /today", "/lead <name> [email] – add a lead", "/help – this list"].join("\n");

/** Handles one update from the bot. Never throws: a bad message gets a short reply instead of a retry storm from Telegram. */
export async function handleUpdate(raw: unknown, now = new Date()): Promise<void> {
  const msg = (raw as Update | null)?.message;
  const chatId = msg?.chat?.id !== undefined ? String(msg.chat.id) : null;
  const text = msg?.text?.trim();
  if (!chatId || !text || msg?.chat?.type !== "private") return; // groups are ignored: commands act as a person
  const reply = (t: string) => sendTelegram(chatId, t).catch((e) => console.error("telegram reply failed", e));

  try {
    const [cmdRaw, ...rest] = text.split(/\s+/);
    const cmd = (cmdRaw ?? "").toLowerCase().replace(/@\w+$/, "");
    const arg = rest.join(" ").trim();

    if (cmd === "/start" && arg) return await reply(await completeLink(chatId, arg, msg?.chat?.first_name ?? msg?.chat?.username ?? null, now));

    const link = await db.userIntegration.findFirst({ where: { kind: "TELEGRAM", externalId: chatId }, orderBy: { createdAt: "asc" } });
    if (!link || !link.workspaceId) return await reply("This chat is not linked yet. In MeetOwl open Settings → Integrations → Telegram and press Connect.");
    await requireIntegrations(link.workspaceId);

    switch (cmd) {
      case "/today":
        return await reply(await today(link.id, link.userId, link.workspaceId, link.config as TelegramConfig));
      case "/task":
        return await reply(await addTask(link.userId, link.workspaceId, arg, link.config as TelegramConfig, now));
      case "/done":
        return await reply(await finish(link.userId, arg, link.config as TelegramConfig));
      case "/lead":
        return await reply(await addLead(link.workspaceId, link.userId, arg));
      default:
        return await reply(HELP);
    }
  } catch (e) {
    const known = e instanceof ApiError ? e.message : null;
    await reply(known ? `Not possible: ${known}` : "Something went wrong. Try again in a moment.");
  }
}

async function completeLink(chatId: string, code: string, chatName: string | null, now: Date): Promise<string> {
  const hash = sha256(code.toLowerCase());
  const candidates = await db.userIntegration.findMany({ where: { kind: "TELEGRAM", config: { path: ["pending", "hash"], equals: hash } } });
  const row = candidates.find((c) => {
    const p = (c.config as TelegramConfig).pending;
    return p && new Date(p.expiresAt) > now;
  });
  if (!row) return "That link code is not valid or has expired. Create a new one in MeetOwl.";
  // A chat belongs to one person: re-linking elsewhere moves it.
  await db.userIntegration.deleteMany({ where: { kind: "TELEGRAM", externalId: chatId, NOT: { id: row.id } } });
  await db.userIntegration.update({ where: { id: row.id }, data: { externalId: chatId, config: { ...(row.config as TelegramConfig), pending: null, chatName } as Prisma.InputJsonValue } });
  return `Connected. ${HELP}`;
}

async function today(linkId: string, userId: string, workspaceId: string, config: TelegramConfig): Promise<string> {
  const day = await getMyDay(userId, workspaceId);
  const tasks = [...day.tasks.overdue, ...day.tasks.today].slice(0, 15);
  await db.userIntegration.update({ where: { id: linkId }, data: { config: { ...config, lastToday: tasks.map((t) => t.id) } as Prisma.InputJsonValue } });
  const lines: string[] = [];
  tasks.forEach((t, i) => lines.push(`${i + 1}. ${t.title}${day.tasks.overdue.some((o) => o.id === t.id) ? " (overdue)" : ""}`));
  for (const e of day.events) lines.push(`• ${e.startsAt?.slice(11, 16) ?? ""} ${e.title}`.trim());
  for (const a of day.crmTasks.slice(0, 5)) lines.push(`• ${a.subject}${a.dealTitle ? ` — ${a.dealTitle}` : ""}`);
  return lines.length ? `Today:\n${lines.join("\n")}${tasks.length ? "\n\nReply /done <n> to finish a task." : ""}` : "Nothing is due today.";
}

/** The task goes to the first open sprint (else epic) of the chosen project, assigned to the sender and due today. */
async function addTask(userId: string, workspaceId: string, title: string, config: TelegramConfig, now: Date): Promise<string> {
  if (!title) return "Usage: /task <title>";
  const projects = await listProjects(userId, workspaceId);
  const project = projects.find((p) => p.id === config.inboxProjectId) ?? projects[0];
  if (!project) return "There is no project to put the task in yet.";
  const tree = await getTree(userId, project.id);
  const parent = tree.nodes.find((n) => n.type === "SPRINT" && n.status !== "DONE" && n.status !== "CANCELLED") ?? tree.nodes.find((n) => n.type === "EPIC");
  if (!parent) return `“${project.title}” has no sprint or epic to hold a task.`;
  const due = new Date(Math.floor(now.getTime() / 86_400_000) * 86_400_000).toISOString();
  await transact(userId, (ctx) => createNode(ctx, { parentId: parent.id, type: "TASK", title: title.slice(0, 200), assigneeId: userId, dueDate: due }));
  return `Added “${title.slice(0, 80)}” to ${project.title}.`;
}

async function finish(userId: string, arg: string, config: TelegramConfig): Promise<string> {
  const n = Number.parseInt(arg, 10);
  const id = Number.isFinite(n) ? config.lastToday?.[n - 1] : undefined;
  if (!id) return "Send /today first, then /done <number>.";
  const node = await db.node.findUnique({ where: { id }, select: { title: true } });
  if (!node) throw notFound("task");
  await transact(userId, (ctx) => completeNode(ctx, id));
  return `Done: ${node.title}`;
}

async function addLead(workspaceId: string, userId: string, arg: string): Promise<string> {
  if (!arg) return "Usage: /lead <name> [email]";
  const email = arg.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0];
  const name = arg.replace(email ?? "", "").trim() || email || "Telegram lead";
  const res = await ingestLead({ workspaceId, source: "telegram", sourceLabel: "Telegram", ownerId: userId }, { name, ...(email ? { email } : {}), message: "Added from Telegram" });
  return res.status === "rejected" ? "The lead was rejected (check the name and e-mail)." : `Lead added: ${name}${res.dealId ? ` → ${appUrl()}/crm?deal=${res.dealId}` : ""}`;
}

// ── outgoing notifications ─────────────────────────────────────────────────

export const telegramChannel: ChannelAdapter = {
  id: "telegram",
  async deliver(recipient, n) {
    const row = await db.userIntegration.findFirst({ where: { userId: recipient.id, kind: "TELEGRAM", externalId: { not: null } } });
    if (!row?.externalId || !telegramConfigured()) return false; // not connected: nothing to retry
    await sendTelegram(row.externalId, `${n.title}${n.body ? `\n${n.body}` : ""}${n.url ? `\n${appUrl()}${n.url}` : ""}`);
    return true;
  },
};
registerChannel(telegramChannel);
