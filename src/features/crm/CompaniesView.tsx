"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, FileUp, GitMerge, Plus, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, Modal, selectClass } from "@/components/ui/modal";
import { useRouter } from "@/i18n/navigation";
import { api, ApiFailure } from "@/features/mindmap/api";
import { cn } from "@/lib/utils";
import { DataTable, Pager, type Column } from "./DataTable";
import { DuplicatesDialog } from "./DuplicatesDialog";
import { moneyLines } from "./format";
import { useMembers } from "./hooks";
import { ImportWizard } from "./ImportWizard";
import type { CompanyListItem, Paged } from "./types";

const STAGES = ["LEAD", "PROSPECT", "CUSTOMER", "CHURNED"] as const;
const STAGE_STYLE: Record<string, string> = { LEAD: "bg-muted", PROSPECT: "bg-primary/15", CUSTOMER: "bg-[var(--health-green)]/20", CHURNED: "bg-[var(--health-red)]/15" };

export function LifecycleBadge({ stage }: { stage: string }) {
  const t = useTranslations("crm");
  return <span className={cn("rounded px-1.5 py-0.5 text-xs", STAGE_STYLE[stage])}>{t(`lifecycle.${stage}`)}</span>;
}

function NewCompanyDialog({ open, onClose, workspaceId, onCreated }: { open: boolean; onClose: () => void; workspaceId: string; onCreated: (id: string) => void }) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const [f, setF] = useState({ legalName: "", website: "", industry: "", city: "", country: "" });
  const [error, setError] = useState<string | null>(null);
  const [dupes, setDupes] = useState<{ id: string; legalName: string }[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(allowDuplicate: boolean) {
    setBusy(true);
    setError(null);
    try {
      const c = await api.post<{ id: string }>(`/api/v1/workspaces/${workspaceId}/companies`, { ...f, allowDuplicate });
      onCreated(c.id);
      setF({ legalName: "", website: "", industry: "", city: "", country: "" });
      setDupes([]);
      onClose();
    } catch (e) {
      if (e instanceof ApiFailure && e.code === "duplicate_company") setDupes(((e.details as { candidates?: { id: string; legalName: string }[] } | undefined)?.candidates) ?? []);
      else setError(e instanceof ApiFailure ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={t("newCompany")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
      >
        <FormField label={t("field.legalName")}>
          <Input required autoFocus value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} />
        </FormField>
        <FormField label={t("field.website")}>
          <Input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="https://" />
        </FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField label={t("field.industry")}>
            <Input value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} />
          </FormField>
          <FormField label={t("field.city")}>
            <Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
          </FormField>
          <FormField label={t("field.country")}>
            <Input value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} />
          </FormField>
        </div>
        {dupes.length > 0 && (
          <div role="alert" className="rounded-md bg-[var(--health-yellow)]/15 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4" />
              {t("similarExists")}
            </div>
            <ul className="mt-1 list-disc pl-6">
              {dupes.map((d) => (
                <li key={d.id}>{d.legalName}</li>
              ))}
            </ul>
            <Button type="button" size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => void submit(true)}>
              {t("createAnyway")}
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="submit" disabled={busy || !f.legalName.trim()}>
            {t("createCompany")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function CompaniesView({ workspaceId, slug, canWrite, canExport, canMerge }: { workspaceId: string; slug: string; canWrite: boolean; canExport: boolean; canMerge: boolean }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const members = useMembers(workspaceId);
  const [q, setQ] = useState("");
  const [lifecycle, setLifecycle] = useState("");
  const [owner, setOwner] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "legalName", dir: "asc" });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dupes, setDupes] = useState(false);

  const params = new URLSearchParams({ sort: sort.key, dir: sort.dir, page: String(page), pageSize: "50", ...(q ? { q } : {}), ...(lifecycle ? { lifecycle } : {}), ...(owner ? { ownerId: owner } : {}) });
  const list = useQuery({ queryKey: ["companies", workspaceId, params.toString()], placeholderData: (p) => p, queryFn: () => api.get<Paged<CompanyListItem>>(`/api/v1/workspaces/${workspaceId}/companies?${params}`) });
  const open = (id: string) => router.push(`/w/${slug}/crm/companies/${id}`);

  const bulk = useMutation({
    mutationFn: async (action: { owner?: string; archive?: boolean }) => {
      await Promise.all([...selected].map((id) => (action.archive ? api.del(`/api/v1/companies/${id}`) : api.patch(`/api/v1/companies/${id}`, { ownerId: action.owner }))));
    },
    onSettled: () => {
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  const columns: Column<CompanyListItem>[] = [
    { key: "name", header: t("field.legalName"), sortKey: "legalName", render: (c) => <span className="font-medium">{c.legalName}</span> },
    { key: "stage", header: t("lifecycleStage"), sortKey: "lifecycleStage", render: (c) => <LifecycleBadge stage={c.lifecycleStage} /> },
    { key: "web", header: t("field.website"), render: (c) => (c.website ? <span className="text-muted-foreground">{c.website.replace(/^https?:\/\//, "")}</span> : "—") },
    { key: "city", header: t("field.city"), render: (c) => [c.city, c.country].filter(Boolean).join(", ") || "—" },
    { key: "contacts", header: t("tabContacts"), render: (c) => c.contacts, className: "tabular-nums" },
    { key: "deals", header: t("openDeals"), render: (c) => c.openDeals, className: "tabular-nums" },
    { key: "revenue", header: t("revenue"), render: (c) => moneyLines(c.revenue, locale) || "—" },
    {
      key: "risk",
      header: t("projectsHealth"),
      render: (c) =>
        c.projectHealth ? (
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-full" style={{ background: `var(--health-${c.projectHealth.toLowerCase()})` }} />
            {c.projectHealth === "RED" && <span className="text-xs text-[var(--health-red)]">{t("atRisk")}</span>}
          </span>
        ) : (
          "—"
        ),
    },
  ];

  const exportHref = `/api/v1/workspaces/${workspaceId}/companies/export`;
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input className="w-56 pl-8" placeholder={t("searchCompanies")} aria-label={t("searchCompanies")} value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} />
        </div>
        <select className={cn(selectClass, "w-40")} aria-label={t("lifecycleStage")} value={lifecycle} onChange={(e) => (setLifecycle(e.target.value), setPage(1))}>
          <option value="">{t("allStages")}</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {t(`lifecycle.${s}`)}
            </option>
          ))}
        </select>
        <select className={cn(selectClass, "w-40")} aria-label={t("owner")} value={owner} onChange={(e) => (setOwner(e.target.value), setPage(1))}>
          <option value="">{t("allOwners")}</option>
          {members.data?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.email}
            </option>
          ))}
        </select>
        <div className="ml-auto flex flex-wrap gap-2">
          {canMerge && (
            <Button variant="outline" size="sm" onClick={() => setDupes(true)}>
              <GitMerge className="size-4" />
              {t("findDuplicates")}
            </Button>
          )}
          {canExport && (
            <Button variant="outline" size="sm" asChild>
              <a href={exportHref} download>
                <Download className="size-4" />
                {t("exportCsv")}
              </a>
            </Button>
          )}
          {canWrite && (
            <>
              <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
                <FileUp className="size-4" />
                {t("importCsv")}
              </Button>
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                {t("newCompany")}
              </Button>
            </>
          )}
        </div>
      </div>

      {selected.size > 0 && canWrite && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm" role="region" aria-label={t("bulkActions")}>
          <span>{t("selected", { count: selected.size })}</span>
          <select className={cn(selectClass, "h-8 w-44")} aria-label={t("assignOwner")} value="" onChange={(e) => e.target.value && bulk.mutate({ owner: e.target.value })}>
            <option value="">{t("assignOwner")}</option>
            {members.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
          <Button size="sm" variant="danger" disabled={bulk.isPending} onClick={() => bulk.mutate({ archive: true })}>
            {t("archive")}
          </Button>
        </div>
      )}

      <DataTable
        label={t("tabCompanies")}
        columns={columns}
        rows={list.data?.items ?? []}
        loading={list.isLoading}
        selected={canWrite ? selected : undefined}
        onSelect={canWrite ? setSelected : undefined}
        sort={sort}
        onSort={(key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }))}
        onRowClick={(c) => open(c.id)}
        empty={t("noCompanies")}
      />
      <Pager page={page} pageSize={50} total={list.data?.total ?? 0} onPage={setPage} />

      <NewCompanyDialog open={creating} onClose={() => setCreating(false)} workspaceId={workspaceId} onCreated={(id) => { void qc.invalidateQueries({ queryKey: ["companies"] }); open(id); }} />
      <ImportWizard open={importing} onClose={() => setImporting(false)} workspaceId={workspaceId} entity="companies" />
      <DuplicatesDialog open={dupes} onClose={() => setDupes(false)} workspaceId={workspaceId} entity="companies" />
    </div>
  );
}
