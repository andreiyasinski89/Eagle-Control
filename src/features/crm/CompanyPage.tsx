"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, selectClass } from "@/components/ui/modal";
import { Link, useRouter } from "@/i18n/navigation";
import { Attachments } from "@/features/drawer/Attachments";
import { Comments } from "@/features/drawer/Comments";
import type { NodeDetail } from "@/features/drawer/types";
import { api, ApiFailure } from "@/features/mindmap/api";
import { useMapStore } from "@/features/mindmap/store";
import { cn } from "@/lib/utils";
import { LifecycleBadge } from "./CompaniesView";
import { NewContactDialog } from "./ContactsView";
import { NewDealDialog } from "./DealDialogs";
import { ClientMapView } from "./ClientMapView";
import { money, moneyLines, shortDate } from "./format";
import { CompanyTimeReport } from "@/features/time/CompanyTimeReport";
import { useMembers, usePipelines } from "./hooks";
import { NodeTags } from "./NodeTags";
import type { ActivityDto, Paged } from "./types";
import { SkeletonRows } from "@/components/ui/skeleton";

interface CompanyDetail {
  id: string;
  legalName: string;
  website: string | null;
  industry: string | null;
  size: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  taxId: string | null;
  source: string | null;
  ownerId: string | null;
  lifecycleStage: "LEAD" | "PROSPECT" | "CUSTOMER" | "CHURNED";
  tags: { id: string; name: string; color: string }[];
  revenue: Record<string, number>;
  atRisk: boolean;
  contacts: { id: string; name: string; position: string | null; emails: string[]; phones: string[] }[];
  deals: { id: string; title: string; amount: number; currency: string; stage: string; status: string; probability: number; health: "GREEN" | "YELLOW" | "RED" }[];
  projects: { id: string; title: string; progress: number; health: "GREEN" | "YELLOW" | "RED"; startDate: string | null; dueDate: string | null; dealId: string }[];
  hours: { total: number; billable: number; byProject: Record<string, number> };
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const LIFECYCLES = ["LEAD", "PROSPECT", "CUSTOMER", "CHURNED"] as const;

export function CompanyPage({ workspaceId, slug, companyId, canWrite, meId, initialTab }: { workspaceId: string; slug: string; companyId: string; canWrite: boolean; meId: string; initialTab?: "overview" | "map" | "time" }) {
  const t = useTranslations("crm");
  const tm = useTranslations("map");
  const tt = useTranslations("time");
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const members = useMembers(workspaceId);
  const pipelines = usePipelines(workspaceId);
  const [tab, setTab] = useState<"overview" | "map" | "time">(initialTab ?? "overview");
  const [newContact, setNewContact] = useState(false);
  const [newDeal, setNewDeal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!members.data) return;
    useMapStore.setState({ people: Object.fromEntries(members.data.map((m) => [m.id, { id: m.id, name: m.name, email: m.email, avatar: null, image: null }])), meId, workspaceId });
  }, [members.data, meId, workspaceId]);

  const { data: c, isError } = useQuery({ queryKey: ["company", companyId], queryFn: () => api.get<CompanyDetail>(`/api/v1/companies/${companyId}`) });
  const { data: node } = useQuery({ queryKey: ["node", companyId], queryFn: () => api.get<NodeDetail>(`/api/v1/nodes/${companyId}`) });
  const feed = useQuery({ queryKey: ["activities", "company", companyId], queryFn: () => api.get<Paged<ActivityDto & { dealTitle: string | null; contactName: string | null }>>(`/api/v1/workspaces/${workspaceId}/activities?companyId=${companyId}&pageSize=30`) });

  const refresh = () => {
    for (const k of [["company", companyId], ["node", companyId], ["activities", "company", companyId], ["companies"], ["company-map", companyId]]) void qc.invalidateQueries({ queryKey: k });
  };
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/v1/companies/${companyId}`, body),
    onSuccess: () => (setError(null), refresh()),
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("error")),
  });
  const archive = useMutation({
    mutationFn: () => api.del(`/api/v1/companies/${companyId}`),
    onSuccess: () => router.push(`/w/${slug}/crm/companies`),
    onError: (e) => setError(e instanceof ApiFailure ? (e.code === "company_has_open_deals" ? t("archiveBlocked") : e.message) : t("error")),
  });

  if (isError) return <div className="p-6 text-sm text-muted-foreground">{t("companyGone")}</div>;
  if (!c) return <div className="p-6"><SkeletonRows rows={5} /></div>;
  const dis = !canWrite;
  const text = (key: keyof CompanyDetail & string, label: string) => (
    <FormField label={label}>
      <Input disabled={dis} defaultValue={(c[key] as string | null) ?? ""} key={`${key}${c[key]}`} onBlur={(e) => e.target.value !== ((c[key] as string | null) ?? "") && patch.mutate({ [key]: e.target.value })} />
    </FormField>
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <Link href={`/w/${slug}/crm/companies`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          {t("tabCompanies")}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{c.legalName}</h1>
          <LifecycleBadge stage={c.lifecycleStage} />
          {c.website && (
            <a href={/^https?:\/\//.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
              {c.website.replace(/^https?:\/\//, "")} ↗
            </a>
          )}
          <div className="ml-auto flex gap-1 rounded-lg border border-border bg-card p-1 text-sm" role="tablist">
            {(["overview", "map", "time"] as const).map((x) => (
              <button key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)} className={cn("rounded-md px-3 py-1", tab === x ? "bg-muted font-medium" : "text-muted-foreground")}>
                {x === "overview" ? t("overview") : x === "map" ? t("clientMap") : tt("tab")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {c.atRisk && (
        <div role="alert" data-testid="risk-banner" className="flex items-center gap-2 rounded-md bg-[var(--health-red)]/15 px-3 py-2 text-sm">
          <AlertTriangle className="size-4 text-[var(--health-red)]" />
          {t("atRiskBanner")}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {tab === "time" ? (
        <CompanyTimeReport companyId={companyId} />
      ) : tab === "map" ? (
        <ClientMapView companyId={companyId} workspaceId={workspaceId} slug={slug} canWrite={canWrite} meId={meId} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card title={t("revenue")}>
              <div className="text-xl font-semibold" data-testid="revenue">{moneyLines(c.revenue, locale) || "—"}</div>
              <div className="text-xs text-muted-foreground">{t("wonDeals")}</div>
            </Card>
            <Card title={t("hoursWorked")}>
              <div className="text-xl font-semibold">{c.hours.total.toFixed(1)} h</div>
              <div className="text-xs text-muted-foreground">{t("billableHours", { hours: c.hours.billable.toFixed(1) })}</div>
            </Card>
            <Card title={t("projectsHealth")}>
              <div className="flex items-center gap-2 text-xl font-semibold">
                {c.projects.length}
                <span className="flex gap-1">
                  {c.projects.map((p) => (
                    <span key={p.id} className="size-3 rounded-full" style={{ background: `var(--health-${p.health.toLowerCase()})` }} title={`${p.title}: ${tm(`health.${p.health}`)}`} />
                  ))}
                </span>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={t("details")}>
              <div className="grid grid-cols-2 gap-3">
                {text("legalName", t("field.legalName"))}
                {text("website", t("field.website"))}
                {text("industry", t("field.industry"))}
                {text("size", t("field.size"))}
                {text("country", t("field.country"))}
                {text("city", t("field.city"))}
                {text("address", t("field.address"))}
                {text("taxId", t("field.taxId"))}
                {text("source", t("field.source"))}
                <FormField label={t("lifecycleStage")}>
                  <select className={selectClass} disabled={dis} value={c.lifecycleStage} onChange={(e) => patch.mutate({ lifecycleStage: e.target.value })}>
                    {LIFECYCLES.map((s) => (
                      <option key={s} value={s}>
                        {t(`lifecycle.${s}`)}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label={t("owner")}>
                  <select className={selectClass} disabled={dis} value={c.ownerId ?? ""} onChange={(e) => patch.mutate({ ownerId: e.target.value || null })}>
                    <option value="">—</option>
                    {members.data?.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name ?? m.email}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
              <div className="mt-3">
                <NodeTags nodeId={companyId} workspaceId={workspaceId} current={c.tags} canWrite={canWrite} onChange={refresh} />
              </div>
              {canWrite && (
                <div className="mt-3 flex justify-end">
                  <Button variant="danger" size="sm" onClick={() => window.confirm(t("archiveConfirm")) && archive.mutate()}>
                    {t("archive")}
                  </Button>
                </div>
              )}
            </Card>

            <div className="flex flex-col gap-4">
              <Card title={t("projects")}>
                {c.projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noProjects")}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {c.projects.map((p) => (
                      <li key={p.id}>
                        <Link href={`/w/${slug}/projects/p/${p.id}`} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm hover:border-primary" style={{ borderLeft: `4px solid var(--health-${p.health.toLowerCase()})` }}>
                          <span className="min-w-0 flex-1 truncate">{p.title}</span>
                          <span className="text-xs tabular-nums text-muted-foreground">{p.progress}%</span>
                          {p.dueDate && <span className="text-xs text-muted-foreground">{shortDate(p.dueDate, locale)}</span>}
                          {c.hours.byProject[p.id] !== undefined && <span className="text-xs text-muted-foreground">{c.hours.byProject[p.id]?.toFixed(1)} h</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card
                title={t("tabPipeline")}
                action={
                  canWrite && (
                    <Button size="sm" variant="outline" onClick={() => setNewDeal(true)}>
                      <Plus className="size-4" />
                      {t("newDeal")}
                    </Button>
                  )
                }
              >
                {c.deals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noDeals")}</p>
                ) : (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {c.deals.map((d) => (
                      <li key={d.id} className="flex items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.status === "open" ? `var(--health-${d.health.toLowerCase()})` : "var(--border)" }} />
                        <Link href={`/w/${slug}/crm?deal=${d.id}`} className="min-w-0 flex-1 truncate hover:underline">
                          {d.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">{d.stage}</span>
                        <span className="tabular-nums">{money(d.amount, d.currency, locale)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card
                title={t("tabContacts")}
                action={
                  canWrite && (
                    <Button size="sm" variant="outline" onClick={() => setNewContact(true)}>
                      <Plus className="size-4" />
                      {t("newContact")}
                    </Button>
                  )
                }
              >
                {c.contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noContacts")}</p>
                ) : (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {c.contacts.map((p) => (
                      <li key={p.id}>
                        <Link href={`/w/${slug}/crm/contacts?contact=${p.id}`} className="font-medium hover:underline">
                          {p.name}
                        </Link>
                        <span className="text-muted-foreground">
                          {p.position ? ` · ${p.position}` : ""}
                          {p.emails[0] ? ` · ${p.emails[0]}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={t("activityFeed")}>
              {feed.data?.items.length === 0 && <p className="text-sm text-muted-foreground">{t("noActivities")}</p>}
              <ul className="flex flex-col gap-2 text-sm">
                {feed.data?.items.map((a) => (
                  <li key={a.id}>
                    <span className="font-medium">{a.subject}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t(`activity.${a.type}`)} · {new Date(a.completedAt ?? a.dueAt ?? a.createdAt).toLocaleString(locale)}
                      {a.contactName ? ` · ${a.contactName}` : ""}
                      {a.dealTitle ? ` · ${a.dealTitle}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <div className="flex flex-col gap-4">
              <Card title={t("comments")}>
                <Comments nodeId={companyId} meId={meId} canComment />
              </Card>
              <Card title={t("files")}>
                <Attachments nodeId={companyId} items={node?.attachments ?? []} canWrite={canWrite} onChange={refresh} />
              </Card>
            </div>
          </div>
        </>
      )}

      <NewContactDialog open={newContact} onClose={() => setNewContact(false)} workspaceId={workspaceId} defaultCompanyId={companyId} onCreated={refresh} />
      <NewDealDialog open={newDeal} onClose={() => setNewDeal(false)} workspaceId={workspaceId} pipeline={pipelines.data?.find((p) => p.isDefault) ?? pipelines.data?.[0]} defaultCompanyId={companyId} onCreated={refresh} />
    </div>
  );
}
