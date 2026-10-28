"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Check, Copy, Lock, Hash, MessageCircle, Send, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { api, ApiFailure } from "@/features/mindmap/api";
import { SkeletonRows } from "@/components/ui/skeleton";

interface Status {
  allowed: boolean;
  canManageSlack: boolean;
  /** The owner of the whole platform: the one who fills in the provider keys. */
  platformAdmin: boolean;
  claude: { url: string; secure: boolean };
  google: { configured: boolean; connected: boolean; email: string | null; needsReconnect: boolean; watching: boolean };
  slack: { configured: boolean; connected: boolean; teamName: string | null; routes: Partial<Record<SlackEvent, string>> };
  telegram: { configured: boolean; linked: boolean; chatName: string | null; webhook: { ok: boolean; url: string | null; lastError: string | null } | null };
}
type SlackEvent = "lead" | "deal_won" | "project_red" | "sprint_ended";
const EVENTS: SlackEvent[] = ["lead", "deal_won", "project_red", "sprint_ended"];

function Card({ title, hint, status, icon: Icon, points, id, children }: { title: string; hint: string; status: React.ReactNode; icon: typeof Calendar; points?: string[]; id: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5" data-testid={`integration-${id}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        <span className="shrink-0 text-xs">{status}</span>
      </div>
      {points && (
        <ul className="flex flex-col gap-1 pl-1 text-sm">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-[var(--health-green)]" aria-hidden />
              {p}
            </li>
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}

/** An address to copy, with a button. */
function CopyField({ value, label }: { value: string; label: string }) {
  const t = useTranslations("integrations");
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      setDone(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm" data-testid="claude-url" />
      <Button size="sm" variant="outline" onClick={() => void copy()} className="shrink-0">
        {done ? <Check className="size-4" /> : <Copy className="size-4" />}
        {done ? t("copied") : t("copy")}
      </Button>
    </div>
  );
}

const Badge = ({ on, children }: { on: boolean; children: React.ReactNode }) => <span className={`rounded-full px-2 py-0.5 ${on ? "bg-[var(--health-green)]/20" : "bg-muted text-muted-foreground"}`}>{children}</span>;

/** Google Calendar, Slack and Telegram: connect, choose where events go, disconnect. Everything here is Pro-only. */
export function IntegrationsPanel({ workspaceId, banner }: { workspaceId: string; banner: { kind: "connected" | "error"; text: string } | null }) {
  const t = useTranslations("integrations");
  const qc = useQueryClient();
  const base = `/api/v1/workspaces/${workspaceId}/integrations`;
  const key = ["integrations", workspaceId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<Status>(base) });
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<{ code: string; url: string | null; bot: string | null } | null>(null);
  const [channels, setChannels] = useState<{ id: string; name: string }[] | null>(null);

  const refresh = () => void qc.invalidateQueries({ queryKey: key });
  const fail = (e: unknown) => setError(e instanceof ApiFailure ? e.message : t("error"));
  const act = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: refresh, onError: fail });
  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    act.mutate(fn);
  };

  if (isLoading || !data) return <div className="p-6"><SkeletonRows rows={5} /></div>;
  if (!data.allowed) {
    return (
      <div data-testid="paywall" className="m-6 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold">{t("paywallTitle")}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{t("paywallText")}</p>
      </div>
    );
  }
  const g = data.google;
  const s = data.slack;
  const tg = data.telegram;
  // Keys of a provider not filled in yet: the person who owns the platform is sent to the setup page, everyone else is told it is coming.
  const unavailable = data.platformAdmin ? (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3 text-sm" data-testid="needs-setup">
      <span className="min-w-0 flex-1">{t("needsSetup")}</span>
      <Button asChild size="sm">
        <Link href="/admin/setup">{t("openSetup")}</Link>
      </Button>
    </div>
  ) : (
    <p className="text-sm text-muted-foreground" data-testid="coming-soon">
      {t("comingSoon")}
    </p>
  );
  const soon = (configured: boolean, on: boolean, label: string) => (configured || on ? label : t("soon"));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      {banner && (
        <p role={banner.kind === "error" ? "alert" : "status"} className={banner.kind === "error" ? "text-sm text-danger" : "text-sm"}>
          {banner.text}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Card id="google" icon={Calendar} points={[t("google.p1"), t("google.p2"), t("google.p3")]} title={t("google.title")} hint={t("google.hint")} status={<Badge on={g.connected && !g.needsReconnect}>{g.connected ? (g.needsReconnect ? t("reconnect") : t("connected")) : soon(g.configured, g.connected, t("off"))}</Badge>}>
        {!g.configured ? (
          unavailable
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {g.connected && <span className="text-sm text-muted-foreground">{g.email}</span>}
            {(!g.connected || g.needsReconnect) && (
              <Button asChild size="sm">
                <a href={`${base}/google/connect`}>{g.needsReconnect ? t("reconnect") : t("connect")}</a>
              </Button>
            )}
            {g.connected && !g.needsReconnect && (
              <Button size="sm" variant="outline" onClick={() => run(() => api.post(`${base}/google/sync`))}>
                {t("google.sync")}
              </Button>
            )}
            {g.connected && (
              <Button size="sm" variant="ghost" onClick={() => run(() => api.del(`${base}/google`))}>
                {t("disconnect")}
              </Button>
            )}
            {g.connected && !g.watching && <span className="text-xs text-muted-foreground">{t("google.polling")}</span>}
          </div>
        )}
      </Card>

      <Card id="slack" icon={Hash} points={[t("slack.p1"), t("slack.p2"), t("slack.p3")]} title={t("slack.title")} hint={t("slack.hint")} status={<Badge on={s.connected}>{s.connected ? (s.teamName ?? t("connected")) : soon(s.configured, s.connected, t("off"))}</Badge>}>
        {!s.configured ? (
          unavailable
        ) : !data.canManageSlack ? (
          <p className="text-sm text-muted-foreground">{t("slack.adminOnly")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {!s.connected && (
                <Button asChild size="sm">
                  <a href={`${base}/slack/connect`}>{t("connect")}</a>
                </Button>
              )}
              {s.connected && (
                <>
                  <Button size="sm" variant="outline" onClick={() => api.get<{ items: { id: string; name: string }[] }>(`${base}/slack/channels`).then((r) => setChannels(r.items)).catch(fail)}>
                    {t("slack.loadChannels")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => run(() => api.del(`${base}/slack`))}>
                    {t("disconnect")}
                  </Button>
                </>
              )}
            </div>
            {s.connected && (
              <table className="text-sm">
                <tbody>
                  {EVENTS.map((ev) => (
                    <tr key={ev}>
                      <td className="py-1 pr-4">{t(`slack.event.${ev}`)}</td>
                      <td>
                        <select
                          aria-label={t(`slack.event.${ev}`)}
                          className="h-8 rounded-md border border-border bg-card px-2"
                          value={s.routes[ev] ?? ""}
                          onChange={(e) => run(() => api.put(`${base}/slack`, { routes: { [ev]: e.target.value || null } }))}
                        >
                          <option value="">{t("slack.nowhere")}</option>
                          {s.routes[ev] && !channels?.some((c) => c.id === s.routes[ev]) && <option value={s.routes[ev]}>{s.routes[ev]}</option>}
                          {channels?.map((c) => (
                            <option key={c.id} value={c.id}>
                              #{c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>

      <Card id="telegram" icon={Send} points={[t("telegram.p1"), t("telegram.p2"), t("telegram.p3")]} title={t("telegram.title")} hint={t("telegram.hint")} status={<Badge on={tg.linked}>{tg.linked ? (tg.chatName ?? t("connected")) : soon(tg.configured, tg.linked, t("off"))}</Badge>}>
        {!tg.configured ? (
          unavailable
        ) : (
          <div className="flex flex-col gap-2">
            {tg.webhook?.ok && (
              <p className="text-xs text-muted-foreground" data-testid="telegram-webhook-ok">
                {t("telegram.botConnected")}
              </p>
            )}
            {tg.webhook && !tg.webhook.ok && (
              <div role="status" data-testid="telegram-webhook-missing" className="flex flex-col gap-2 rounded-md bg-muted p-3 text-sm">
                <span>{t("telegram.botNotConnected")}</span>
                {data.canManageSlack ? (
                  <Button size="sm" className="self-start" onClick={() => run(() => api.post(`${base}/telegram/webhook`))}>
                    {t("telegram.connectBot")}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">{t("telegram.askAdmin")}</span>
                )}
              </div>
            )}
            {tg.webhook?.lastError && <p className="text-xs text-danger">{t("telegram.lastError", { error: tg.webhook.lastError })}</p>}
            <div className="flex flex-wrap gap-2">
              {!tg.linked && (
                <Button size="sm" onClick={() => api.post<{ code: string; url: string | null; bot: string | null }>(`${base}/telegram/link`).then(setCode).catch(fail)}>
                  {t("telegram.link")}
                </Button>
              )}
              {tg.linked && (
                <Button size="sm" variant="ghost" onClick={() => run(() => api.del(`${base}/telegram`))}>
                  {t("disconnect")}
                </Button>
              )}
            </div>
            {code && !tg.linked && (
              <div className="rounded-md bg-muted p-3 text-sm" data-testid="telegram-code">
                {code.url ? (
                  <a className="text-primary hover:underline" href={code.url} target="_blank" rel="noopener noreferrer">
                    {t("telegram.open", { bot: code.bot ?? "" })}
                  </a>
                ) : (
                  <span>{t("telegram.manual", { bot: code.bot ?? "bot", code: code.code })}</span>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{t("telegram.expires")}</p>
                <Button size="sm" variant="ghost" onClick={refresh}>
                  {t("telegram.check")}
                </Button>
              </div>
            )}
            {tg.linked && <p className="text-xs text-muted-foreground">{t("telegram.commands")}</p>}
          </div>
        )}
      </Card>
      <Card id="claude" icon={Sparkles} points={[t("claude.p1"), t("claude.p2"), t("claude.p3")]} title={t("claude.title")} hint={t("claude.hint")} status={<Badge on={data.claude.secure}>{data.claude.secure ? t("claude.ready") : t("soon")}</Badge>}>
        {data.claude.secure ? (
          <div className="flex flex-col gap-3">
            <ol className="flex flex-col gap-1.5 text-sm">
              {[t("claude.s1"), t("claude.s2"), t("claude.s3")].map((x, i) => (
                <li key={x} className="flex gap-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                  {x}
                </li>
              ))}
            </ol>
            <CopyField value={data.claude.url} label={t("claude.urlLabel")} />
          </div>
        ) : (
          unavailable
        )}
      </Card>

      <Card id="whatsapp" icon={MessageCircle} title={t("whatsapp.title")} hint={t("whatsapp.hint")} status={<Badge on={false}>{t("soon")}</Badge>}>
        <p className="text-sm text-muted-foreground">{t("whatsapp.soon")}</p>
      </Card>
    </div>
  );
}
