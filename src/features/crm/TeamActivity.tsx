"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/features/mindmap/api";
import { PERIODS, type ActivityStatus } from "@/modules/crm/team-activity";
import { cn } from "@/lib/utils";
import { SkeletonRows } from "@/components/ui/skeleton";
import { ContactDrawer } from "./ContactDrawer";

interface Counts {
  added: number;
  contacted: number;
  presentations: number;
  clients: number;
  partners: number;
  meetings: number;
  tasks: number;
}
interface Partner {
  id: string;
  name: string;
  status: ActivityStatus;
  lastAt: string | null;
  counts: Counts;
  below: number;
}
interface Invitee {
  id: string;
  name: string;
  joinedAt: string | null;
  shared: boolean;
  status: ActivityStatus;
  lastAt: string | null;
  counts: Counts | null;
}
interface Data {
  days: number;
  partners: Partner[];
  invitees: Invitee[];
  totals: { partners: number; invitees: number; quiet: number };
}

const COLUMNS = ["added", "contacted", "presentations", "clients", "partners", "meetings", "tasks"] as const;
const DOT: Record<ActivityStatus, string> = { active: "var(--health-green)", quiet: "var(--health-yellow)", gone: "var(--health-red)", never: "var(--muted-foreground)" };

/**
 * How the people directly below you are doing: for each, what they did over the last 7 or 30 days and when they last did something,
 * with a colour for "active", "gone quiet" and "long gone". Partners of your own CRM come first; below them the people who came through your
 * platform link, whose numbers appear only if they chose to share them.
 */
export function TeamActivity({ workspaceId, slug, canWrite, canExport, canErase, meId }: { workspaceId: string; slug: string; canWrite: boolean; canExport: boolean; canErase: boolean; meId: string }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const openId = search.get("contact");
  const [days, setDays] = useState<(typeof PERIODS)[number]>(7);
  const { data, isLoading, isError } = useQuery({ queryKey: ["team-activity", workspaceId, days], queryFn: () => api.get<Data>(`/api/v1/workspaces/${workspaceId}/team-activity?days=${days}`) });

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (id) next.set("contact", id);
    else next.delete("contact");
    router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
  };
  const ago = (iso: string | null): string => {
    if (!iso) return t("actNever");
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    return d <= 0 ? t("actToday") : d === 1 ? t("actYesterday") : t("actDaysAgo", { n: d });
  };
  const status = (s: ActivityStatus) => (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs" data-status={s}>
      <span className="size-2.5 rounded-full" style={{ background: DOT[s] }} aria-hidden />
      {t(`actStatus.${s}`)}
    </span>
  );
  const head = (
    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
      <th className="px-3 py-2">{t("actPerson")}</th>
      <th className="px-3 py-2">{t("actState")}</th>
      <th className="px-3 py-2">{t("actLast")}</th>
      {COLUMNS.map((c) => (
        <th key={c} className="px-3 py-2 text-right">
          {t(`actCol.${c}`)}
        </th>
      ))}
    </tr>
  );
  const numbers = (c: Counts) => COLUMNS.map((k) => (
    <td key={k} className={cn("px-3 py-2 text-right tabular-nums", c[k] === 0 && "text-muted-foreground")}>
      {c[k]}
    </td>
  ));

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4" data-testid="team-activity">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t("actTitle")}</h1>
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1" role="tablist" aria-label={t("actPeriod")}>
          {PERIODS.map((p) => (
            <button key={p} role="tab" aria-selected={days === p} onClick={() => setDays(p)} data-testid={`act-period-${p}`} className={cn("rounded-md px-3 py-1 text-sm", days === p ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
              {t("actDays", { n: p })}
            </button>
          ))}
        </div>
        {data && data.totals.quiet > 0 && (
          <span className="rounded-full bg-[var(--health-yellow)]/15 px-3 py-1 text-xs text-[var(--health-yellow)]" data-testid="act-quiet-count">
            {t("actQuiet", { n: data.totals.quiet })}
          </span>
        )}
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">{t("actHint")}</p>
      {isError && <p role="alert" className="text-sm text-danger">{t("error")}</p>}
      {isLoading && <SkeletonRows rows={4} />}

      {data && (
        <>
          <section className="flex flex-col gap-2" data-testid="act-partners">
            <h2 className="text-base font-semibold">{t("actPartnersTitle")}</h2>
            {data.partners.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">{t("actPartnersEmpty")}</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead>{head}</thead>
                  <tbody>
                    {data.partners.map((p) => (
                      <tr key={p.id} className="border-t border-border" data-testid="act-partner-row" data-partner={p.id}>
                        <td className="px-3 py-2">
                          <button type="button" className="font-medium hover:underline" onClick={() => setOpen(p.id)}>
                            {p.name}
                          </button>
                          {p.below > 0 && <span className="ml-2 text-xs text-muted-foreground">{t("actBelow", { n: p.below })}</span>}
                        </td>
                        <td className="px-3 py-2">{status(p.status)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{ago(p.lastAt)}</td>
                        {numbers(p.counts)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2" data-testid="act-invitees">
            <h2 className="text-base font-semibold">{t("actInviteesTitle")}</h2>
            <p className="max-w-3xl text-xs text-muted-foreground">{t("actInviteesHint")}</p>
            {data.invitees.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">{t("actInviteesEmpty")}</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead>{head}</thead>
                  <tbody>
                    {data.invitees.map((u) => (
                      <tr key={u.id} className="border-t border-border" data-testid="act-invitee-row">
                        <td className="px-3 py-2">
                          <span className="font-medium">{u.name}</span>
                          {u.joinedAt && <span className="ml-2 text-xs text-muted-foreground">{t("actJoined", { date: new Date(u.joinedAt).toLocaleDateString(locale, { day: "numeric", month: "short" }) })}</span>}
                        </td>
                        {u.shared && u.counts ? (
                          <>
                            <td className="px-3 py-2">{status(u.status)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{ago(u.lastAt)}</td>
                            {numbers(u.counts)}
                          </>
                        ) : (
                          <td colSpan={COLUMNS.length + 2} className="px-3 py-2 text-xs text-muted-foreground" data-testid="act-not-shared">
                            {t("actNotShared")}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {openId && <ContactDrawer key={openId} workspaceId={workspaceId} slug={slug} contactId={openId} canWrite={canWrite} canErase={canErase} canExport={canExport} meId={meId} onClose={() => setOpen(null)} />}
    </div>
  );
}
