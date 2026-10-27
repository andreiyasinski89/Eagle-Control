"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, FilePlus2, Link2, Pin, PinOff, Search, StickyNote, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiFailure } from "@/features/mindmap/api";
import { extractUrls, hostOf, safeUrl } from "@/modules/notes/links";
import { cn } from "@/lib/utils";

interface NoteItem {
  id: string;
  kind: "NOTE" | "LINK";
  title: string;
  preview: string;
  url: string | null;
  pinned: boolean;
  updatedAt: string;
}
interface NoteFull {
  id: string;
  kind: "NOTE" | "LINK";
  title: string;
  body: string;
  url: string | null;
  pinned: boolean;
  updatedAt: string;
}
type Filter = "all" | "NOTE" | "LINK" | "pinned";

/**
 * A notebook of one's own: notes and useful links, private to whoever writes them. A note saves as it is typed, like a paper pad;
 * the web addresses written in it become links under the text.
 */
export function NotesView({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("notes");
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const selected = search.get("note");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(filter === "NOTE" || filter === "LINK" ? { kind: filter } : {}), ...(filter === "pinned" ? { pinned: "1" } : {}) });
  const list = useQuery({ queryKey: ["notes", workspaceId, params.toString()], placeholderData: (p) => p, queryFn: () => api.get<{ items: NoteItem[]; total: number }>(`/api/v1/workspaces/${workspaceId}/notes?${params}`) });

  const select = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(search.toString());
      if (id) next.set("note", id);
      else next.delete("note");
      router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [pathname, router, search],
  );

  const add = useMutation({
    mutationFn: (kind: "NOTE" | "LINK") => api.post<NoteFull>(`/api/v1/workspaces/${workspaceId}/notes`, { kind }),
    onSuccess: (n) => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ["notes", workspaceId] });
      select(n.id);
    },
    onError: (e) => setError(e instanceof ApiFailure && e.code === "note_limit" ? t("limit") : t("failed")),
  });

  const items = list.data?.items ?? [];
  const filters: [Filter, string][] = [
    ["all", t("filterAll")],
    ["NOTE", t("filterNotes")],
    ["LINK", t("filterLinks")],
    ["pinned", t("filterPinned")],
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4" data-testid="notes-view">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold">{t("title")}</h1>
        <Button size="sm" onClick={() => add.mutate("NOTE")} disabled={add.isPending} data-testid="new-note">
          <FilePlus2 className="size-4" />
          {t("newNote")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => add.mutate("LINK")} disabled={add.isPending} data-testid="new-link">
          <Link2 className="size-4" />
          {t("newLink")}
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{t("private")}</span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[19rem_1fr]">
        <aside className={cn("flex min-h-0 flex-col gap-2 rounded-2xl border border-border bg-card p-2", selected && "max-md:hidden")}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input aria-label={t("search")} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" data-testid="notes-search" />
          </div>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t("filter")}>
            {filters.map(([f, label]) => (
              <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)} className={cn("h-7 rounded-full border px-2.5 text-xs", filter === f ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground hover:bg-muted")}>
                {label}
              </button>
            ))}
          </div>
          <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" data-testid="notes-list">
            {list.isLoading && <Skeleton className="h-16 rounded-lg" />}
            {list.data && items.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted-foreground">{list.data.total === 0 ? t("empty") : t("nothingFound")}</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => select(n.id)} aria-current={selected === n.id} data-testid="note-row" data-note={n.id} className={cn("flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left text-sm", selected === n.id ? "bg-primary/10" : "hover:bg-muted")}>
                  <span className="flex items-center gap-1.5">
                    {n.kind === "LINK" ? <Link2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : <StickyNote className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate font-medium">{n.title || (n.kind === "LINK" && n.url ? hostOf(n.url) : t("untitled"))}</span>
                    {n.pinned && <Pin className="size-3.5 shrink-0 text-primary" aria-label={t("pinned")} />}
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{n.preview || (n.kind === "LINK" && n.url ? hostOf(n.url) : "")}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className={cn("min-h-0 min-w-0", !selected && "max-md:hidden")}>
          {selected ? <Editor key={selected} noteId={selected} workspaceId={workspaceId} onBack={() => select(null)} onGone={() => select(null)} /> : <div className="grid h-full min-h-48 place-items-center rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t("pick")}</div>}
        </section>
      </div>
    </div>
  );
}

type Status = "saved" | "saving" | "failed";

function Editor({ noteId, workspaceId, onBack, onGone }: { noteId: string; workspaceId: string; onBack: () => void; onGone: () => void }) {
  const t = useTranslations("notes");
  const locale = useLocale();
  const qc = useQueryClient();
  const { data, isError } = useQuery({ queryKey: ["note", noteId], staleTime: Infinity, queryFn: () => api.get<NoteFull>(`/api/v1/notes/${noteId}`) });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [pinned, setPinned] = useState(false);
  const [status, setStatus] = useState<Status>("saved");
  const [loaded, setLoaded] = useState(false);
  const pending = useRef<Partial<{ title: string; body: string; url: string | null; pinned: boolean }>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gone = useRef(false);

  useEffect(() => {
    if (!data || loaded) return;
    setTitle(data.title);
    setBody(data.body);
    setUrl(data.url ?? "");
    setPinned(data.pinned);
    setLoaded(true);
  }, [data, loaded]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    if (gone.current || Object.keys(patch).length === 0) return;
    pending.current = {};
    setStatus("saving");
    try {
      await api.patch(`/api/v1/notes/${noteId}`, patch);
      setStatus("saved");
      void qc.invalidateQueries({ queryKey: ["notes", workspaceId] });
    } catch (e) {
      // Keep what could not be saved so the next change (or a retry) sends it again.
      pending.current = { ...patch, ...pending.current };
      void e;
      setStatus("failed");
    }
  }, [noteId, workspaceId, qc]);

  const change = (patch: Partial<{ title: string; body: string; url: string | null; pinned: boolean }>) => {
    pending.current = { ...pending.current, ...patch };
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  };

  // Leaving the note (or the page) saves what is still waiting.
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void flush();
    };
  }, [flush]);

  const remove = useMutation({
    mutationFn: () => api.del(`/api/v1/notes/${noteId}`),
    onSuccess: () => {
      gone.current = true;
      pending.current = {};
      void qc.invalidateQueries({ queryKey: ["notes", workspaceId] });
      onGone();
    },
  });

  if (isError) return <p className="rounded-2xl border border-border p-6 text-sm text-muted-foreground">{t("notFound")}</p>;
  if (!data || !loaded) return <Skeleton className="h-64 rounded-2xl" />;

  const isLink = data.kind === "LINK";
  const open = isLink ? safeUrl(url) : null;
  const found = extractUrls(body);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4" data-testid="note-editor">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void flush().then(onBack)} className="rounded-md p-1.5 hover:bg-muted md:hidden" aria-label={t("back")}>
          <ArrowLeft className="size-4" />
        </button>
        <Input value={title} maxLength={200} placeholder={isLink ? t("linkTitlePlaceholder") : t("titlePlaceholder")} aria-label={t("titleLabel")} onChange={(e) => (setTitle(e.target.value), change({ title: e.target.value }))} className="border-transparent px-1 text-lg font-semibold shadow-none focus-visible:border-border" data-testid="note-title" />
        <button type="button" aria-pressed={pinned} aria-label={pinned ? t("unpin") : t("pin")} title={pinned ? t("unpin") : t("pin")} data-testid="note-pin" className={cn("rounded-md p-2 hover:bg-muted", pinned ? "text-primary" : "text-muted-foreground")} onClick={() => (setPinned(!pinned), change({ pinned: !pinned }))}>
          {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        </button>
        <button type="button" aria-label={t("delete")} title={t("delete")} data-testid="note-delete" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-danger" onClick={() => window.confirm(t("deleteConfirm")) && remove.mutate()}>
          <Trash2 className="size-4" />
        </button>
      </div>

      {isLink && (
        <div className="flex items-center gap-2">
          <Input value={url} maxLength={2000} placeholder="https://" aria-label={t("urlLabel")} onChange={(e) => {
              setUrl(e.target.value);
              // Only a real web address is sent; while it is not one, the hint says so and the old address stays.
              const ok = safeUrl(e.target.value);
              if (ok) change({ url: ok });
              else if (e.target.value.trim() === "") change({ url: null });
            }} data-testid="note-url" />
          {open ? (
            <Button asChild size="sm" variant="outline" className="shrink-0 whitespace-nowrap">
              <a href={open} target="_blank" rel="noopener noreferrer" data-testid="note-open">
                <ExternalLink className="size-4" />
                {t("openLink", { host: hostOf(open) })}
              </a>
            </Button>
          ) : (
            <span className="shrink-0 text-xs text-[var(--health-yellow)]">{t("badUrl")}</span>
          )}
        </div>
      )}

      <textarea value={body} maxLength={50_000} placeholder={isLink ? t("linkBodyPlaceholder") : t("bodyPlaceholder")} aria-label={t("bodyLabel")} onChange={(e) => (setBody(e.target.value), change({ body: e.target.value }))} className="min-h-48 w-full flex-1 resize-none rounded-md border border-transparent bg-transparent p-1 text-sm leading-relaxed outline-none focus-visible:border-border" data-testid="note-body" />

      {found.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="note-links">
          <span className="text-xs font-medium text-muted-foreground">{t("linksFound")}</span>
          <ul className="flex flex-wrap gap-1.5">
            {found.map((u) => (
              <li key={u}>
                <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-xs items-center gap-1 truncate rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs hover:border-primary">
                  <ExternalLink className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{hostOf(u)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span role="status" data-testid="note-status" data-state={status}>
          {status === "saving" ? t("saving") : status === "failed" ? t("saveFailed") : t("saved")}
        </span>
        <span>{t("changedAt", { when: new Date(data.updatedAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) })}</span>
      </div>
    </div>
  );
}
