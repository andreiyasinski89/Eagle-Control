"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, Circle, Copy, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import { api, ApiFailure } from "@/features/mindmap/api";
import { cn } from "@/lib/utils";

type Id = "inngest" | "telegram" | "google" | "slack" | "claude";
interface Setup {
  appUrl: string;
  https: boolean;
  providers: { id: Id; ready: boolean; vars: { name: string; set: boolean }[]; values: { key: string; value: string }[] }[];
}
interface Check {
  ok: boolean;
  code: string;
  detail?: string | null;
}

/** The number of numbered steps each service needs; their words are in the messages as `setup.p.<id>.s1…`. */
const STEPS: Record<Id, number> = { inngest: 6, telegram: 6, google: 7, slack: 6, claude: 2 };
/** Where the owner does each step: the page to open. */
const LINKS: Record<Id, { label: string; url: string } | null> = {
  inngest: { label: "app.inngest.com", url: "https://app.inngest.com" },
  telegram: { label: "@BotFather", url: "https://t.me/BotFather" },
  google: { label: "console.cloud.google.com", url: "https://console.cloud.google.com" },
  slack: { label: "api.slack.com/apps", url: "https://api.slack.com/apps" },
  claude: null,
};
const ORDER: Id[] = ["inngest", "telegram", "google", "slack", "claude"];

function CopyValue({ label, value }: { label: string; value: string }) {
  const t = useTranslations("setup");
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
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 p-2.5" data-testid="setup-value">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all text-xs">{value}</code>
        <Button size="sm" variant="outline" onClick={() => void copy()} className="shrink-0">
          {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {done ? t("copied") : t("copy")}
        </Button>
      </div>
    </div>
  );
}

/**
 * The platform owner's checklist for connecting MeetOwl to outside services. Each service is registered once, here: the page says what to
 * click there, gives the addresses to paste, lists the settings to add in Vercel (ticking those that are in) and can test the result.
 * After this everyone else connects with one button.
 */
export function PlatformSetup() {
  const t = useTranslations("setup");
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["platform-setup"], queryFn: () => api.get<Setup>("/api/v1/admin/setup") });
  const [open, setOpen] = useState<Id | null>(null);
  const [results, setResults] = useState<Partial<Record<Id, Check>>>({});
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => setError(e instanceof ApiFailure ? e.message : t("error"));
  const test = useMutation({
    mutationFn: (provider: Id) => api.post<Check>("/api/v1/admin/setup/test", { provider }).then((r) => [provider, r] as const),
    onSuccess: ([p, r]) => (setError(null), setResults((x) => ({ ...x, [p]: r }))),
    onError: fail,
  });
  const hook = useMutation({
    mutationFn: () => api.post("/api/v1/admin/setup/telegram-webhook"),
    onSuccess: () => (setError(null), void test.mutate("telegram"), void qc.invalidateQueries({ queryKey: ["platform-setup"] })),
    onError: fail,
  });

  if (isLoading || !data) return <div className="mx-auto max-w-3xl p-6"><SkeletonRows rows={5} /></div>;
  const providers = ORDER.map((id) => data.providers.find((p) => p.id === id)).filter((p): p is Setup["providers"][number] => !!p);
  const readyCount = providers.filter((p) => p.ready).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6" data-testid="platform-setup">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm">
        <span className="font-medium" data-testid="setup-progress">
          {t("progress", { n: readyCount, total: providers.length })}
        </span>
        <span className="text-xs text-muted-foreground">{t("vercelNote")}</span>
      </div>
      {!data.https && (
        <p role="alert" className="rounded-lg border border-[var(--health-yellow)] p-3 text-sm" data-testid="setup-https">
          {t("httpsWarn", { url: data.appUrl })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {providers.map((p) => {
        const isOpen = open === p.id;
        const r = results[p.id];
        const link = LINKS[p.id];
        return (
          <section key={p.id} className={cn("rounded-2xl border bg-card", isOpen ? "border-primary" : "border-border")} data-testid={`setup-${p.id}`} data-ready={p.ready}>
            <button type="button" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 p-4 text-left">
              {p.ready ? <CheckCircle2 className="size-6 shrink-0 text-[var(--health-green)]" aria-hidden /> : <Circle className="size-6 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t(`p.${p.id}.title`)}</span>
                <span className="block text-sm text-muted-foreground">{t(`p.${p.id}.why`)}</span>
              </span>
              <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs", p.ready ? "bg-[var(--health-green)]/20" : "bg-muted text-muted-foreground")}>{p.ready ? t("ready") : t("notReady")}</span>
            </button>

            {isOpen && (
              <div className="flex flex-col gap-4 border-t border-border p-4">
                {link && (
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline">
                    <ExternalLink className="size-4" aria-hidden />
                    {t("openSite", { name: link.label })}
                  </a>
                )}
                <ol className="flex flex-col gap-2.5 text-sm">
                  {Array.from({ length: STEPS[p.id] }, (_, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                      <span className="pt-0.5">{t(`p.${p.id}.s${i + 1}`)}</span>
                    </li>
                  ))}
                </ol>

                {p.values.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold">{t("valuesTitle")}</h3>
                    {p.values.map((v) => (
                      <CopyValue key={v.key} label={t(`value.${v.key}`)} value={v.value} />
                    ))}
                  </div>
                )}

                {p.vars.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold">{t("varsTitle")}</h3>
                    <ul className="flex flex-col gap-1">
                      {p.vars.map((v) => (
                        <li key={v.name} className="flex items-center gap-2 text-sm" data-var={v.name} data-set={v.set}>
                          {v.set ? <Check className="size-4 text-[var(--health-green)]" aria-label={t("varSet")} /> : <Circle className="size-4 text-muted-foreground" aria-label={t("varMissing")} />}
                          <code className="text-xs">{v.name}</code>
                          <span className="text-xs text-muted-foreground">{v.set ? t("varSet") : t("varMissing")}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => test.mutate(p.id)} disabled={test.isPending} data-testid={`setup-test-${p.id}`}>
                    {t("check")}
                  </Button>
                  {p.id === "telegram" && r && r.code === "telegram_webhook" && (
                    <Button size="sm" variant="outline" onClick={() => hook.mutate()} disabled={hook.isPending} data-testid="setup-connect-bot">
                      {t("connectBot")}
                    </Button>
                  )}
                </div>
                {r && (
                  <p role="status" className={cn("rounded-lg p-3 text-sm", r.ok ? "bg-[var(--health-green)]/15" : "bg-muted")} data-testid={`setup-result-${p.id}`} data-ok={r.ok}>
                    {t(`result.${r.code}`, { name: r.detail ?? "" })}
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
