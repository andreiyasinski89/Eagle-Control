"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { hub } from "@/features/realtime/hub";

interface Item {
  id: string;
  kind: string;
  payload: { title?: string; body?: string | null; url?: string | null };
  readAt: string | null;
  createdAt: string;
}

/** The bell: unread count, latest notifications, mark as read. Polls once a minute; realtime pushes arrive in the same list. */
export function NotificationBell({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/notifications?workspaceId=${workspaceId}&limit=20`);
      if (!res.ok) return;
      const body = (await res.json()) as { unread: number; items: Item[] };
      setItems(body.items);
      setUnread(body.unread);
    } catch {
      /* offline: keep what we have */
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 60_000);
    const onPush = () => void load();
    window.addEventListener("meetowl:notification", onPush);
    return () => {
      clearInterval(id);
      window.removeEventListener("meetowl:notification", onPush);
    };
  }, [load]);

  // Pushed by the server the moment a notification is written; the poll above stays as a safety net.
  useEffect(
    () =>
      hub.subscribe(["user"], (e) => {
        if (e.type === "notification" || e.type === "reconnected") void load();
      }),
    [load],
  );

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open]);

  async function markAll() {
    await fetch("/api/v1/notifications/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true, workspaceId }) });
    void load();
  }
  async function markOne(id: string) {
    await fetch("/api/v1/notifications/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
    void load();
  }

  return (
    <div className="relative" ref={box}>
      <button aria-label={t("title")} aria-expanded={open} onClick={() => setOpen((v) => !v)} className="relative rounded-md p-2 hover:bg-muted" data-testid="bell">
        <Bell className="size-4" />
        {unread > 0 && (
          <span data-testid="bell-count" className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-[var(--health-red)] px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label={t("title")} className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] rounded-lg border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm">
            <span className="font-medium">{t("title")}</span>
            <button className="text-xs text-primary hover:underline disabled:opacity-50" disabled={unread === 0} onClick={markAll}>
              {t("markAll")}
            </button>
          </div>
          <ul className="max-h-96 overflow-auto">
            {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">{t("empty")}</li>}
            {items.map((n) => {
              const inner = (
                <>
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{n.payload.title ?? n.kind}</span>
                    {n.payload.body && <span className="block truncate text-xs text-muted-foreground">{n.payload.body}</span>}
                    <span className="block text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}</span>
                  </span>
                </>
              );
              return (
                <li key={n.id} className="border-b border-border last:border-0">
                  {n.payload.url ? (
                    <Link href={`/w/${slug}${n.payload.url}`} onClick={() => (setOpen(false), void markOne(n.id))} className="flex gap-2 px-3 py-2 hover:bg-muted">
                      {inner}
                    </Link>
                  ) : (
                    <button onClick={() => void markOne(n.id)} className="flex w-full gap-2 px-3 py-2 text-left hover:bg-muted">
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <Link href={`/w/${slug}/settings/notifications`} onClick={() => setOpen(false)} className="block border-t border-border px-3 py-2 text-center text-xs text-muted-foreground hover:text-foreground">
            {t("settings")}
          </Link>
        </div>
      )}
    </div>
  );
}
