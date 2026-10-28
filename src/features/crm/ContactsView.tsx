"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, FileUp, GitMerge, Plus, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, Modal, selectClass } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";
import { cn } from "@/lib/utils";
import { STAGES, type Stage } from "@/modules/crm/people";
import { ContactDrawer, messengerLinks } from "./ContactDrawer";
import { useDeclineAsk } from "./DeclineReason";
import { DataTable, Pager, type Column } from "./DataTable";
import { DuplicatesDialog } from "./DuplicatesDialog";
import { useCompanyOptions, useMembers } from "./hooks";
import { ImportWizard } from "./ImportWizard";
import type { ContactListItem, Paged } from "./types";

function NewContactDialog({ open, onClose, workspaceId, defaultCompanyId, onCreated }: { open: boolean; onClose: () => void; workspaceId: string; defaultCompanyId?: string; onCreated: (id: string) => void }) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const companies = useCompanyOptions(workspaceId);
  const empty = { firstName: "", lastName: "", email: "", phone: "", position: "", companyId: defaultCompanyId ?? "" };
  const [f, setF] = useState(empty);
  const [consent, setConsent] = useState(false);
  const [dupes, setDupes] = useState<{ id: string; name: string; emails: string[] }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(allowDuplicate: boolean) {
    setBusy(true);
    setError(null);
    try {
      const c = await api.post<{ id: string }>(`/api/v1/workspaces/${workspaceId}/contacts`, {
        firstName: f.firstName,
        lastName: f.lastName || null,
        position: f.position || null,
        emails: f.email ? [f.email] : [],
        phones: f.phone ? [f.phone] : [],
        companyId: f.companyId || null,
        consentGiven: consent,
        allowDuplicate,
      });
      setF(empty);
      setDupes([]);
      setConsent(false);
      onCreated(c.id);
      onClose();
    } catch (e) {
      if (e instanceof ApiFailure && e.code === "duplicate_contact") setDupes(((e.details as { candidates?: typeof dupes } | undefined)?.candidates) ?? []);
      else setError(e instanceof ApiFailure ? (e.code === "plan_limit" ? t("planLimit") : e.message) : t("error"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={t("newContact")}>
      <form className="flex flex-col gap-3" onSubmit={(e) => (e.preventDefault(), void submit(false))}>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t("field.firstName")}>
            <Input required autoFocus value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
          </FormField>
          <FormField label={t("field.lastName")}>
            <Input value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
          </FormField>
          <FormField label={t("field.email")}>
            <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </FormField>
          <FormField label={t("field.phone")}>
            <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </FormField>
          <FormField label={t("field.position")}>
            <Input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} />
          </FormField>
          <FormField label={t("company")}>
            <select className={selectClass} value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })}>
              <option value="">—</option>
              {companies.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legalName}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          {t("consentGiven")}
        </label>
        {dupes.length > 0 && (
          <div role="alert" className="rounded-md bg-[var(--health-yellow)]/15 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4" />
              {t("similarExists")}
            </div>
            <ul className="mt-1 list-disc pl-6">
              {dupes.map((d) => (
                <li key={d.id}>
                  {d.name} <span className="text-muted-foreground">{d.emails.join(", ")}</span>
                </li>
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
          <Button type="submit" disabled={busy || !f.firstName.trim()}>
            {t("createContact")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export { NewContactDialog };

export function ContactsView({ workspaceId, slug, canWrite, canExport, canMerge, canErase, meId }: { workspaceId: string; slug: string; canWrite: boolean; canExport: boolean; canMerge: boolean; canErase: boolean; meId: string }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const openId = search.get("contact");
  const members = useMembers(workspaceId);
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [cold, setCold] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dupes, setDupes] = useState(false);

  const filters = { ...(q ? { q } : {}), ...(owner ? { ownerId: owner } : {}), ...(cold ? { noTouchDays: "30" } : {}) };
  const params = new URLSearchParams({ sort: sort.key, dir: sort.dir, page: String(page), pageSize: "50", ...filters });
  const list = useQuery({ queryKey: ["contacts", workspaceId, params.toString()], placeholderData: (p) => p, queryFn: () => api.get<Paged<ContactListItem>>(`/api/v1/workspaces/${workspaceId}/contacts?${params}`) });

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (id) next.set("contact", id);
    else next.delete("contact");
    router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const bulk = useMutation({
    mutationFn: async (action: { owner?: string; archive?: boolean }) => {
      await Promise.all([...selected].map((id) => (action.archive ? api.del(`/api/v1/contacts/${id}`) : api.patch(`/api/v1/contacts/${id}`, { ownerId: action.owner }))));
    },
    onSettled: () => {
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  const decline = useDeclineAsk();
  // The stage is changed right in the table: the pill is a choice list, and the row shows the new stage at once.
  const setStage = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: Stage }) => api.patch(`/api/v1/contacts/${id}`, { stage }),
    onMutate: ({ id, stage }) => {
      const was = qc.getQueriesData<Paged<ContactListItem>>({ queryKey: ["contacts", workspaceId] });
      for (const [k, v] of was) if (v) qc.setQueryData<Paged<ContactListItem>>(k, { ...v, items: v.items.map((i) => (i.id === id ? { ...i, stage } : i)) });
      return { was };
    },
    onError: (_e, _v, ctx) => {
      for (const [k, v] of ctx?.was ?? []) qc.setQueryData(k, v);
    },
    onSuccess: (_d, { id, stage }) => stage === "DECLINED" && decline.ask(id),
    onSettled: () => {
      for (const k of ["contacts", "people", "contact", "partners", "activities"]) void qc.invalidateQueries({ queryKey: [k] });
    },
  });

  const columns: Column<ContactListItem>[] = [
    {
      key: "name",
      header: t("name"),
      sortKey: "name",
      render: (c) => (
        <div>
          <div className="font-medium">
            {c.name}
            {c.temperature && (
              <span className="ml-1.5" title={t(`temp.${c.temperature}`)} aria-label={t(`temp.${c.temperature}`)} data-testid="contact-temperature">
                {{ HOT: "🔥", WARM: "🟡", COLD: "❄️" }[c.temperature]}
              </span>
            )}
          </div>
          {c.position && <div className="text-xs text-muted-foreground">{c.position}</div>}
        </div>
      ),
    },
    {
      key: "stage",
      header: t("field.stage"),
      render: (c) =>
        !c.stage ? (
          "—"
        ) : canWrite ? (
          <select
            value={c.stage}
            aria-label={`${t("field.stage")}: ${c.name}`}
            data-testid="stage-select"
            className="cursor-pointer appearance-none whitespace-nowrap rounded-full border border-transparent bg-muted py-0.5 pl-2.5 pr-6 text-xs hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' stroke='%238b8b9a' stroke-width='1.6'%3E%3Cpath d='M1 1l4 4 4-4'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setStage.mutate({ id: c.id, stage: e.target.value as Stage })}
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {t(`funnelStage.${s}`)}
              </option>
            ))}
          </select>
        ) : (
          <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs">{t(`funnelStage.${c.stage}`)}</span>
        ),
    },
    { key: "company", header: t("company"), render: (c) => c.companyName ?? "—" },
    { key: "email", header: t("field.email"), render: (c) => c.emails[0] ?? "—" },
    { key: "phone", header: t("field.phone"), render: (c) => c.phones[0] ?? "—" },
    {
      key: "messengers",
      header: t("messengers"),
      render: (c) => (
        <span className="flex gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
          {Object.entries(c.messengers).map(([k, v]) => (
            <a key={k} href={messengerLinks[k]?.(v)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {t(`field.${k}`)}
            </a>
          ))}
          {Object.keys(c.messengers).length === 0 && "—"}
        </span>
      ),
    },
    {
      key: "last",
      header: t("lastTouch"),
      sortKey: "lastContactedAt",
      render: (c) => {
        if (!c.lastContactedAt) return <span className="text-muted-foreground">—</span>;
        const days = Math.floor((Date.now() - new Date(c.lastContactedAt).getTime()) / 86_400_000);
        return <span className={cn(days > 30 && "text-[var(--health-yellow)]")}>{new Date(c.lastContactedAt).toLocaleDateString(locale)}</span>;
      },
    },
    { key: "consent", header: t("consent"), render: (c) => (c.consentGiven ? <span className="text-[var(--health-green)]">✓</span> : <span className="text-muted-foreground">—</span>) },
  ];

  const exportHref = `/api/v1/workspaces/${workspaceId}/contacts/export?${new URLSearchParams(filters)}`;
  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-auto p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input className="w-56 pl-8" placeholder={t("searchContacts")} aria-label={t("searchContacts")} value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} />
          </div>
          <select className={cn(selectClass, "w-40")} aria-label={t("owner")} value={owner} onChange={(e) => (setOwner(e.target.value), setPage(1))}>
            <option value="">{t("allOwners")}</option>
            {members.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={cold} onChange={(e) => (setCold(e.target.checked), setPage(1))} />
            {t("noTouch30")}
          </label>
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
                  {t("newContact")}
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
          label={t("tabContacts")}
          columns={columns}
          rows={list.data?.items ?? []}
          loading={list.isLoading}
          selected={canWrite ? selected : undefined}
          onSelect={canWrite ? setSelected : undefined}
          sort={sort}
          onSort={(key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }))}
          onRowClick={(c) => setOpen(c.id)}
          activeId={openId}
          empty={t("noContacts")}
        />
        <Pager page={page} pageSize={50} total={list.data?.total ?? 0} onPage={setPage} />
      </div>

      {openId && <ContactDrawer key={openId} workspaceId={workspaceId} slug={slug} contactId={openId} canWrite={canWrite} canErase={canErase} canExport={canExport} meId={meId} onClose={() => setOpen(null)} />}

      {decline.dialog}
      <NewContactDialog open={creating} onClose={() => setCreating(false)} workspaceId={workspaceId} onCreated={(id) => { void qc.invalidateQueries({ queryKey: ["contacts"] }); setOpen(id); }} />
      <ImportWizard open={importing} onClose={() => setImporting(false)} workspaceId={workspaceId} entity="contacts" />
      <DuplicatesDialog open={dupes} onClose={() => setDupes(false)} workspaceId={workspaceId} entity="contacts" />
    </div>
  );
}
