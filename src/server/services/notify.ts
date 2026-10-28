import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { sendMail } from "@/server/mail";
import { env } from "@/lib/env";
import type { Tx } from "./nodes/access";
import { publishNotification } from "@/server/realtime";
import { noticeHref } from "@/lib/notice-href";

export const NOTIFY_KINDS = ["mention", "assigned", "lead", "deal_won", "project_red", "reminder", "sprint_ended", "due_today", "cold_contact", "stale_deal", "billing", "client_activity", "invite_joined"] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];
export type Channel = "app" | "email" | "slack" | "telegram";

/** Where each kind goes unless the person chose otherwise. The in-app bell always gets a copy. */
export const DEFAULT_CHANNELS: Record<NotifyKind, Channel[]> = {
  mention: ["app", "email"],
  assigned: ["app"],
  lead: ["app", "slack"],
  deal_won: ["app", "slack"],
  project_red: ["app", "slack"],
  reminder: ["app", "email"],
  sprint_ended: ["app", "slack"],
  due_today: ["app", "telegram"],
  cold_contact: ["app"],
  stale_deal: ["app"],
  billing: ["app", "email"],
  client_activity: ["app", "email"],
  invite_joined: ["app"],
};

export interface Notice {
  userId: string;
  workspaceId: string;
  kind: NotifyKind;
  title: string;
  body?: string;
  /** Path inside the app, e.g. /w/acme/projects/p/abc?node=def */
  url?: string;
  /** Same key + same user = delivered once, however often a job runs. */
  dedupeKey?: string;
  payload?: Record<string, unknown>;
  /** Force extra channels on top of preferences (e.g. a reminder that asked for e-mail). */
  extraChannels?: Channel[];
}

export interface Recipient {
  id: string;
  email: string;
  name: string | null;
  locale: string;
}

export interface ChannelAdapter {
  id: Exclude<Channel, "app">;
  /** Returns false when the person has not connected this channel (nothing to retry). */
  deliver(recipient: Recipient, notice: { title: string; body: string | null; url: string | null; kind: string; workspaceId: string }): Promise<boolean>;
}

const adapters = new Map<string, ChannelAdapter>();
export const registerChannel = (a: ChannelAdapter) => void adapters.set(a.id, a);

registerChannel({
  id: "email",
  async deliver(r, n) {
    const link = n.url ? `${env().APP_URL}${n.url}` : env().APP_URL;
    await sendMail({
      to: r.email,
      subject: n.title,
      text: `${n.title}\n${n.body ? `\n${n.body}\n` : ""}\n${link}`,
      html: `<p><b>${esc(n.title)}</b></p>${n.body ? `<p>${esc(n.body)}</p>` : ""}<p><a href="${link}">Open in MeetOwl</a></p>`,
    });
    return true;
  },
});

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** Channels for one person and kind: their saved choice, else the default; "app" is always on. */
export async function channelsFor(tx: Tx | typeof db, userId: string, workspaceId: string, kind: NotifyKind, extra: Channel[] = []): Promise<Channel[]> {
  const pref = await tx.notificationPreference.findUnique({ where: { userId_workspaceId_kind: { userId, workspaceId, kind } } });
  const base = (pref?.channels as Channel[] | undefined) ?? DEFAULT_CHANNELS[kind];
  return [...new Set<Channel>(["app", ...base, ...extra])];
}

/**
 * Writes the in-app notification and queues the other channels in the row itself (an outbox), so a crash
 * between "save" and "send" cannot lose or double-send anything. Safe to call inside a transaction.
 * Returns null when this dedupe key was already delivered.
 */
export async function notify(notice: Notice, tx: Tx | typeof db = db): Promise<string | null> {
  if (notice.dedupeKey) {
    const seen = await tx.notification.findUnique({ where: { userId_dedupeKey: { userId: notice.userId, dedupeKey: notice.dedupeKey } }, select: { id: true } });
    if (seen) return null;
  }
  const channels = await channelsFor(tx, notice.userId, notice.workspaceId, notice.kind, notice.extraChannels);
  const row = await tx.notification.create({
    data: {
      userId: notice.userId,
      workspaceId: notice.workspaceId,
      kind: notice.kind,
      dedupeKey: notice.dedupeKey ?? null,
      payload: { title: notice.title, body: notice.body ?? null, url: notice.url ?? null, ...(notice.payload ?? {}) } as Prisma.InputJsonValue,
      pendingChannels: channels.filter((c) => c !== "app"),
    },
  });
  publishNotification(notice.userId);
  return row.id;
}

const MAX_AGE_MS = 24 * 3_600_000;

/** Drains the outbox: sends each pending channel once, keeps failures for the next run, gives up after a day. */
export async function deliverPending(limit = 100, now = new Date()): Promise<{ sent: number; failed: number }> {
  const rows = await db.notification.findMany({ where: { NOT: { pendingChannels: { isEmpty: true } } }, orderBy: { createdAt: "asc" }, take: limit, include: { user: { select: { id: true, email: true, name: true, locale: true } }, workspace: { select: { slug: true } } } });
  let sent = 0;
  let failed = 0;
  for (const n of rows) {
    const p = n.payload as { title?: string; body?: string | null; url?: string | null };
    const left: string[] = [];
    for (const ch of n.pendingChannels) {
      const adapter = adapters.get(ch);
      if (!adapter) continue; // channel not available in this deployment: drop it
      try {
        const ok = await adapter.deliver(n.user, { title: p.title ?? n.kind, body: p.body ?? null, url: p.url ? noticeHref(n.workspace.slug, p.url) : `/w/${n.workspace.slug}`, kind: n.kind, workspaceId: n.workspaceId });
        if (ok) sent++;
      } catch (e) {
        failed++;
        console.error(`notify ${ch} failed`, e);
        if (now.getTime() - n.createdAt.getTime() < MAX_AGE_MS) left.push(ch);
      }
    }
    await db.notification.update({ where: { id: n.id }, data: { pendingChannels: left } });
  }
  return { sent, failed };
}

export async function listNotifications(userId: string, opts: { workspaceId?: string; unreadOnly?: boolean; limit?: number } = {}) {
  const where: Prisma.NotificationWhereInput = { userId, ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}), ...(opts.unreadOnly ? { readAt: null } : {}) };
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(opts.limit ?? 30, 100), select: { id: true, kind: true, payload: true, readAt: true, createdAt: true, workspaceId: true } }),
    db.notification.count({ where: { userId, readAt: null, ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}) } }),
  ]);
  return { unread, items };
}

export async function markRead(userId: string, input: { ids?: string[]; all?: boolean; workspaceId?: string }) {
  const where: Prisma.NotificationWhereInput = { userId, readAt: null, ...(input.all ? (input.workspaceId ? { workspaceId: input.workspaceId } : {}) : { id: { in: input.ids ?? [] } }) };
  const res = await db.notification.updateMany({ where, data: { readAt: new Date() } });
  return { updated: res.count };
}

export async function getPreferences(userId: string, workspaceId: string) {
  const rows = await db.notificationPreference.findMany({ where: { userId, workspaceId } });
  const saved = new Map(rows.map((r) => [r.kind, r.channels]));
  return NOTIFY_KINDS.map((kind) => ({ kind, channels: (saved.get(kind) as Channel[] | undefined) ?? DEFAULT_CHANNELS[kind], custom: saved.has(kind) }));
}

export async function setPreference(userId: string, workspaceId: string, kind: NotifyKind, channels: Channel[]) {
  const clean = [...new Set(channels.filter((c) => c !== "app"))];
  await db.notificationPreference.upsert({ where: { userId_workspaceId_kind: { userId, workspaceId, kind } }, create: { userId, workspaceId, kind, channels: clean }, update: { channels: clean } });
}
