"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiFailure } from "@/features/mindmap/api";
import { buildMessengerLink, CHANNELS, lacksCountryCode, normalizeUsername, phoneWithCode, type Channel, type MessengerContact } from "@/modules/crm/messenger";
import { cn } from "@/lib/utils";
import { startCopy } from "./useScripts";

export interface MessengerPerson extends MessengerContact {
  id: string;
  name: string;
}

/** Small drawings of the three messengers, built in (nothing is loaded from outside); the colour of each is theirs, the rest of the button is quiet. */
export function MessengerIcon({ channel, muted, className }: { channel: Channel; muted?: boolean; className?: string }) {
  const gid = useId();
  const stroke = channel === "telegram" ? "#229ED9" : channel === "whatsapp" ? "#25D366" : `url(#${gid})`;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn("size-5 shrink-0", muted && "opacity-50", className)}>
      {channel === "telegram" && <path d="M21.5 3.5 2.8 10.8c-1.2.5-1.2 1.2-.2 1.5l4.8 1.5 1.9 5.7c.2.6.4.8.8.8s.6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3-14.7c.3-1.3-.5-1.9-1.5-1.5Z" />}
      {channel === "whatsapp" && (
        <>
          <path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3Z" />
          <path d="M9 8.4c0 3.6 3 6.6 6.6 6.6l1-2-2.3-1-1 1a5 5 0 0 1-2.2-2.2l1-1-1-2.3Z" />
        </>
      )}
      {channel === "instagram" && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#F58529" />
              <stop offset="0.5" stopColor="#DD2A7B" />
              <stop offset="1" stopColor="#8134AF" />
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.3" cy="6.7" r="0.6" fill={stroke} />
        </>
      )}
    </svg>
  );
}

/** Opens a link in a new tab; the address of an app (`tg://…`) is followed in place with a hidden link, so that no empty tab is left behind. */
function openLink(url: string) {
  if (/^https?:/i.test(url)) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const HOVER: Record<Channel, string> = { telegram: "hover:border-[#229ED9]", whatsapp: "hover:border-[#25D366]", instagram: "hover:border-[#DD2A7B]" };

/**
 * The three buttons "write in Telegram / WhatsApp / Instagram". A press copies the text (before the link is opened, in the same press: phones allow nothing else),
 * opens the chat with the person when we know where it is, or the place to choose a person when we do not, and, when asked to, writes the message into the person's feed
 * with a way to take it back. A button without the data for a direct chat stays pressable and carries a pencil to type the missing name or number on the spot.
 */
export function MessengerButtons({ workspaceId, person, text, canWrite = true, logActivity = false, compact = false, onUsed }: { workspaceId: string; person: MessengerPerson; text: string; canWrite?: boolean; logActivity?: boolean; compact?: boolean; onUsed?: (channel: Channel) => void }) {
  const t = useTranslations("messenger");
  const qc = useQueryClient();
  const [done, setDone] = useState<Channel | null>(null);
  const [note, setNote] = useState<{ text: string; undoId?: string; web?: string } | null>(null);
  const [editing, setEditing] = useState<Channel | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => void timers.current.push(setTimeout(fn, ms));
  const sending = !compact && text.trim() !== "";

  const log = useMutation({
    mutationFn: (channel: Channel) => api.post<{ id: string }>(`/api/v1/workspaces/${workspaceId}/activities`, { type: "MESSAGE", subject: t(`logged.${channel}`), body: text.trim(), contactId: person.id, completed: true }),
    onSuccess: (a) => {
      setNote((n) => (n ? { ...n, undoId: a.id } : n));
      for (const k of ["activities", "contact", "my-day", "people", "touch-queue"]) void qc.invalidateQueries({ queryKey: [k] });
    },
  });
  const undo = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/activities/${id}`),
    onSuccess: () => {
      setNote({ text: t("undone") });
      later(() => setNote(null), 3000);
      for (const k of ["activities", "contact", "my-day", "people", "touch-queue"]) void qc.invalidateQueries({ queryKey: [k] });
    },
  });

  function press(channel: Channel) {
    const link = buildMessengerLink(channel, person, sending ? text : "");
    // The copy is started first and the link opened at once: both belong to this very press.
    const copying = sending ? startCopy(text) : null;
    openLink(link.url);
    // The address of an app opens nothing if the app is not there: the way to the browser version is offered at once, the text being in the clipboard.
    if (link.webFallback) {
      setNote({ text: t("appHint"), web: link.webFallback });
      later(() => setNote((n) => (n?.web ? null : n)), 12000);
    }
    setDone(channel);
    later(() => setDone((d) => (d === channel ? null : d)), 1000);
    onUsed?.(channel);
    if (!copying) return;
    void copying.then((ok) => {
      setNote((n) => ({ ...n, text: n?.web ? `${ok ? t("copied") : t("copyFailed")}. ${n.text}` : ok ? t("copied") : t("copyFailed") }));
      later(() => setNote(null), 12000);
    });
    if (logActivity && canWrite) log.mutate(channel);
  }

  const missing = (c: Channel) => !buildMessengerLink(c, person, "").direct;
  const noCode = person.phones.some(lacksCountryCode) && !person.phones.some((p) => phoneWithCode(p)) && !phoneWithCode(person.messengers.whatsapp);

  return (
    <div className="flex flex-col gap-2" data-testid="messenger-buttons">
      <div className={cn("grid gap-2", compact ? "grid-cols-3 sm:flex" : "grid-cols-3")}>
        {CHANNELS.map((c) => {
          const miss = missing(c);
          return (
            <div key={c} className="relative flex min-w-0 items-stretch">
              <button
                type="button"
                onClick={() => press(c)}
                title={miss ? t(`hint.${c}`) : undefined}
                className={cn("flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-1.5 text-[13px] text-foreground transition-colors hover:bg-muted sm:text-sm", HOVER[c], compact && "sm:min-w-11 sm:flex-none")}
                data-testid={`messenger-${c}`}
                data-direct={miss ? "no" : "yes"}
                aria-label={compact ? t(`name.${c}`) : undefined}
              >
                {done === c ? <Check className="size-5 text-[var(--health-green)]" aria-hidden /> : <MessengerIcon channel={c} muted={miss} />}
                {!compact && <span className="truncate">{t(`name.${c}`)}</span>}
              </button>
              {miss && canWrite && !compact && (
                // A small pencil on the corner of the button; the invisible area around it makes the press as big as a thumb needs.
                <button
                  type="button"
                  data-compact
                  aria-label={t(`add.${c}`)}
                  title={t(`hint.${c}`)}
                  onClick={() => setEditing(editing === c ? null : c)}
                  className="absolute -right-1.5 -top-2 grid size-6 place-items-center rounded-full border border-border bg-card text-muted-foreground before:absolute before:-inset-3 before:content-[''] hover:bg-muted"
                  data-testid={`messenger-edit-${c}`}
                >
                  <Pencil className="size-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {editing && <QuickValue channel={editing} person={person} onClose={() => setEditing(null)} />}
      {!compact && noCode && (
        <p className="text-xs text-[var(--health-yellow)]" data-testid="messenger-nocode">
          {t("noCode")}
        </p>
      )}
      {note && (
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="messenger-note">
          {note.text}
          {note.web && (
            <a href={note.web} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-primary hover:underline" data-testid="messenger-web">
              {t("openWeb")}
            </a>
          )}
          {note.undoId && (
            <button type="button" className="inline-flex min-h-11 items-center text-primary hover:underline" onClick={() => undo.mutate(note.undoId as string)} data-testid="messenger-undo">
              {t("undo")}
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/** Types the one missing thing (a name, or a number with its code) without leaving the card. Soft: a doubtful value is saved with a remark, not refused. */
function QuickValue({ channel, person, onClose }: { channel: Channel; person: MessengerPerson; onClose: () => void }) {
  const t = useTranslations("messenger");
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const doubt = value.trim() !== "" && (channel === "whatsapp" ? phoneWithCode(value) === null : normalizeUsername(channel, value) === null);
  const save = useMutation({
    mutationFn: () => api.patch(`/api/v1/contacts/${person.id}`, { messengers: { [channel]: value.trim() } }),
    onSuccess: () => {
      for (const k of ["contact", "contacts", "people", "touch-queue"]) void qc.invalidateQueries({ queryKey: [k] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("error")),
  });
  return (
    <form
      className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) save.mutate();
      }}
      data-testid="messenger-quick"
    >
      <label className="text-xs text-muted-foreground" htmlFor={`q-${channel}`}>
        {t(`field.${channel}`)}
      </label>
      <div className="flex gap-2">
        <Input id={`q-${channel}`} className="h-11 min-w-0 flex-1" autoFocus autoComplete="off" value={value} placeholder={t(`placeholder.${channel}`)} onChange={(e) => setValue(e.target.value)} data-testid="messenger-quick-input" />
        <Button type="submit" className="min-h-11" disabled={!value.trim() || save.isPending} data-testid="messenger-quick-save">
          {t("save")}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>
          {t("cancel")}
        </Button>
      </div>
      {doubt && <p className="text-xs text-[var(--health-yellow)]">{t(channel === "whatsapp" ? "doubtPhone" : "doubtName")}</p>}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
