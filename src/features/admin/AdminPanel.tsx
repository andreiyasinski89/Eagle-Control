"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, Gift, Search, ShieldCheck, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiFailure } from "@/features/mindmap/api";
import { cn } from "@/lib/utils";

type Plan = "FREE" | "PRO" | "ENTERPRISE";
interface Row {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  suspended: boolean;
  isSuperAdmin: boolean;
  invitedBy: string | null;
  invitedCount: number;
  points: number;
  workspaces: { id: string; name: string; plan: Plan }[];
}
interface List {
  mode: "off" | "preview" | "on";
  total: number;
  page: number;
  pageSize: number;
  items: Row[];
}
interface Detail {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  telegram: string | null;
  locale: string;
  timezone: string;
  createdAt: string;
  termsAcceptedAt: string | null;
  suspendedAt: string | null;
  isSuperAdmin: boolean;
  invitedBy: { id: string; name: string } | null;
  invited: { id: string; name: string; at: string | null }[];
  points: number;
  pointsLog: { id: string; points: number; reason: string; note: string | null; at: string }[];
  workspaces: { id: string; name: string; slug: string; plan: Plan; role: string; crm: string; members: number; contacts: number | null }[];
  actions: { id: string; action: string; at: string; data: Record<string, unknown> }[];
}

/**
 * The platform owner's view of everyone who has an account: how they registered, what they own and may open, who invited them and
 * whom they invited, their bonus points; and the means to block an account, set a workspace's plan and change the points.
 * Their clients and projects are not shown here: only the account and the access around it.
 */
export function AdminPanel() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const params = new URLSearchParams({ page: String(page), ...(q.trim() ? { q: q.trim() } : {}) });
  const list = useQuery({ queryKey: ["admin-users", params.toString()], placeholderData: (p) => p, queryFn: () => api.get<List>(`/api/v1/admin/users?${params}`) });
  const detail = useQuery({ queryKey: ["admin-user", open], enabled: !!open, queryFn: () => api.get<Detail>(`/api/v1/admin/users/${open}`) });
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "—");

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-users"] });
    void qc.invalidateQueries({ queryKey: ["admin-user"] });
  };
  const fail = (e: unknown) => setError(e instanceof ApiFailure ? e.message : t("error"));
  const suspend = useMutation({ mutationFn: (v: { id: string; suspended: boolean }) => api.post(`/api/v1/admin/users/${v.id}/suspend`, { suspended: v.suspended }), onSuccess: () => (setError(null), refresh()), onError: fail });
  const plan = useMutation({ mutationFn: (v: { id: string; plan: Plan }) => api.patch(`/api/v1/admin/workspaces/${v.id}`, { plan: v.plan }), onSuccess: () => (setError(null), refresh()), onError: fail });
  const recompute = useMutation({ mutationFn: () => api.post<{ checked: number; changed: number }>("/api/v1/admin/plans/recompute"), onSuccess: (r) => (setError(null), setRecomputed(t("recomputed", { n: r.changed, total: r.checked })), refresh()), onError: fail });
  const [recomputed, setRecomputed] = useState<string | null>(null);
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const bonus = useMutation({
    mutationFn: (v: { id: string; points: number; note: string }) => api.post(`/api/v1/admin/users/${v.id}/bonus`, { points: v.points, note: v.note || undefined }),
    onSuccess: () => (setError(null), setPoints(""), setNote(""), refresh()),
    onError: fail,
  });

  const d = detail.data;
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:p-6" data-testid="admin-panel">
      <header className="flex flex-wrap items-center gap-3">
        <ShieldCheck className="size-6 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input className="w-64 pl-8" placeholder={t("search")} aria-label={t("search")} value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} data-testid="admin-search" />
        </div>
      </header>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {list.data && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm" data-testid="admin-paid-mode">
          <span className="font-medium">{t("paidPlans")}:</span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", list.data.mode === "on" ? "bg-[var(--health-green)]/15 text-[var(--health-green)]" : list.data.mode === "preview" ? "bg-[var(--health-yellow)]/20" : "bg-muted")} data-testid="admin-mode">
            {t(`mode_${list.data.mode}`)}
          </span>
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">{t(`modeHint_${list.data.mode}`)}</span>
          <Button type="button" variant="outline" size="sm" disabled={recompute.isPending} onClick={() => recompute.mutate()} data-testid="admin-recompute">
            {t("recompute")}
          </Button>
          {recomputed && (
            <span role="status" className="w-full text-xs text-muted-foreground">
              {recomputed}
            </span>
          )}
        </div>
      )}

      <div className={cn("grid gap-4", open && "lg:grid-cols-[1fr_26rem]")}>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-sm" data-testid="admin-users">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t("user")}</th>
                <th className="px-3 py-3 font-medium">{t("registered")}</th>
                <th className="px-3 py-3 font-medium">{t("invitedBy")}</th>
                <th className="px-3 py-3 font-medium">{t("workspaces")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("invitedN")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("points")}</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((u) => (
                <tr key={u.id} onClick={() => setOpen(u.id)} data-testid="admin-row" className={cn("cursor-pointer border-t border-border hover:bg-muted/40", open === u.id && "bg-primary/5", u.suspended && "opacity-60")}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} email={u.email} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-medium">
                          <span className="truncate">{u.name ?? u.email}</span>
                          {u.isSuperAdmin && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">{t("owner")}</span>}
                          {u.suspended && <span className="rounded-full bg-[var(--health-red)]/15 px-2 py-0.5 text-[11px] text-[var(--health-red)]">{t("suspended")}</span>}
                        </div>
                        {u.name && <div className="truncate text-xs text-muted-foreground">{u.email}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{day(u.createdAt)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{u.invitedBy ?? "—"}</td>
                  <td className="px-3 py-2.5">{u.workspaces.length ? u.workspaces.map((w) => `${w.name} · ${w.plan}`).join(", ") : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{u.invitedCount}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{u.points}</td>
                </tr>
              ))}
              {list.data?.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    {t("none")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <span>{t("total", { n: list.data?.total ?? 0 })}</span>
            <span className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                ‹
              </Button>
              {page} / {pages}
              <Button type="button" variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                ›
              </Button>
            </span>
          </div>
        </div>

        {open && (
          <aside className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4" data-testid="admin-detail">
            {!d ? (
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <Avatar name={d.name} email={d.email} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-semibold">{d.name ?? d.email}</div>
                    <div className="truncate text-sm text-muted-foreground">{d.email}</div>
                  </div>
                  <button type="button" aria-label={t("close")} className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => setOpen(null)}>
                    <X className="size-4" />
                  </button>
                </div>

                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm" data-testid="admin-registration">
                  <dt className="text-muted-foreground">{t("registered")}</dt>
                  <dd>{day(d.createdAt)}</dd>
                  <dt className="text-muted-foreground">{t("terms")}</dt>
                  <dd>{day(d.termsAcceptedAt)}</dd>
                  <dt className="text-muted-foreground">{t("name")}</dt>
                  <dd>{[d.firstName, d.lastName].filter(Boolean).join(" ") || "—"}</dd>
                  <dt className="text-muted-foreground">{t("phone")}</dt>
                  <dd>{d.phone ?? "—"}</dd>
                  <dt className="text-muted-foreground">Telegram</dt>
                  <dd>{d.telegram ? `@${d.telegram}` : "—"}</dd>
                  <dt className="text-muted-foreground">{t("language")}</dt>
                  <dd>
                    {d.locale} · {d.timezone}
                  </dd>
                  <dt className="text-muted-foreground">{t("invitedBy")}</dt>
                  <dd>{d.invitedBy?.name ?? "—"}</dd>
                </dl>

                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("access")}</h3>
                  {d.workspaces.length === 0 && <p className="text-sm text-muted-foreground">{t("noWorkspaces")}</p>}
                  <ul className="flex flex-col gap-2">
                    {d.workspaces.map((w) => (
                      <li key={w.id} className="rounded-xl border border-border p-2.5 text-sm" data-testid="admin-workspace">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{w.role}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t("members", { n: w.members })}
                          {w.contacts !== null && ` · ${t("people", { n: w.contacts })}`} · CRM: {w.crm}
                        </div>
                        {w.role === "OWNER" && (
                          <label className="mt-2 flex items-center gap-2 text-xs">
                            {t("plan")}
                            <select className="h-8 rounded-md border border-border bg-card px-2 text-sm" value={w.plan} disabled={plan.isPending} data-testid="admin-plan" onChange={(e) => plan.mutate({ id: w.id, plan: e.target.value as Plan })}>
                              <option value="FREE">FREE</option>
                              <option value="PRO">PRO</option>
                              <option value="ENTERPRISE">ENTERPRISE</option>
                            </select>
                          </label>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Gift className="size-3.5" aria-hidden />
                    {t("bonus")}: <span className="text-foreground" data-testid="admin-points">{d.points}</span>
                  </h3>
                  <form
                    className="flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const n = Number(points);
                      if (Number.isInteger(n) && n !== 0) bonus.mutate({ id: d.id, points: n, note });
                    }}
                  >
                    <Input className="w-24" type="number" step={1} placeholder="+5 / -1" aria-label={t("points")} value={points} onChange={(e) => setPoints(e.target.value)} data-testid="admin-bonus-points" />
                    <Input className="min-w-0 flex-1" placeholder={t("note")} aria-label={t("note")} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
                    <Button type="submit" size="sm" variant="outline" disabled={bonus.isPending || !points} data-testid="admin-bonus-add">
                      {t("change")}
                    </Button>
                  </form>
                  {d.pointsLog.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
                      {d.pointsLog.slice(0, 5).map((p) => (
                        <li key={p.id}>
                          {day(p.at)} · {p.points > 0 ? "+" : ""}
                          {p.points} · {p.reason === "invite" ? t("reasonInvite") : (p.note ?? t("reasonAdjust"))}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {d.invited.length > 0 && (
                  <section>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("invitedList", { n: d.invited.length })}</h3>
                    <ul className="flex flex-col gap-0.5 text-sm">
                      {d.invited.map((i) => (
                        <li key={i.id}>
                          <button type="button" className="hover:underline" onClick={() => setOpen(i.id)}>
                            {i.name}
                          </button>
                          <span className="text-xs text-muted-foreground"> · {day(i.at)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {d.actions.length > 0 && (
                  <section>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("history")}</h3>
                    <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                      {d.actions.map((a) => (
                        <li key={a.id}>
                          {day(a.at)} · {a.action}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {!d.isSuperAdmin && (
                  <div className="border-t border-border pt-3">
                    {d.suspendedAt ? (
                      <Button type="button" variant="outline" onClick={() => suspend.mutate({ id: d.id, suspended: false })} disabled={suspend.isPending} data-testid="admin-restore">
                        <CheckCircle2 className="size-4" aria-hidden />
                        {t("restore")}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="danger"
                        disabled={suspend.isPending}
                        data-testid="admin-suspend"
                        onClick={() => {
                          if (window.confirm(t("suspendConfirm", { name: d.name ?? d.email }))) suspend.mutate({ id: d.id, suspended: true });
                        }}
                      >
                        <Ban className="size-4" aria-hidden />
                        {t("suspend")}
                      </Button>
                    )}
                    <p className="mt-1.5 text-xs text-muted-foreground">{d.suspendedAt ? t("suspendedNote", { date: day(d.suspendedAt) }) : t("suspendNote")}</p>
                  </div>
                )}
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
