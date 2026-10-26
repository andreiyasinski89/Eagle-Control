"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Mail, Phone, ShieldAlert, StickyNote, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, Modal, selectClass } from "@/components/ui/modal";
import { Link } from "@/i18n/navigation";
import { Attachments } from "@/features/drawer/Attachments";
import { Comments } from "@/features/drawer/Comments";
import type { NodeDetail } from "@/features/drawer/types";
import { api, ApiFailure } from "@/features/mindmap/api";
import { useMapStore } from "@/features/mindmap/store";
import { ActivityDialog } from "./DealDialogs";
import { dayInput, dayToIso, money } from "./format";
import { useCompanyOptions, useMembers } from "./hooks";
import { NodeTags } from "./NodeTags";
import type { ActivityDto, Paged } from "./types";

export interface ContactDetail {
  id: string;
  name: string;
  firstName: string;
  lastName: string | null;
  position: string | null;
  emails: string[];
  phones: string[];
  messengers: Record<string, string>;
  companyId: string | null;
  companyName: string | null;
  ownerId: string | null;
  birthday: string | null;
  consentGiven: boolean;
  consentAt: string | null;
  lastContactedAt: string | null;
  tags: { id: string; name: string; color: string }[];
  consentHistory: { id: string; purpose: string; givenAt: string; source: string | null; revokedAt: string | null }[];
  deals: { id: string; title: string; stage: string; amount: number; currency: string }[];
}

const clean = (v: string) => v.replace(/^@/, "").trim();
export const messengerLinks: Record<string, (v: string) => string> = {
  telegram: (v) => `https://t.me/${clean(v)}`,
  whatsapp: (v) => `https://wa.me/${v.replace(/\D/g, "")}`,
  instagram: (v) => `https://instagram.com/${clean(v)}`,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border px-4 py-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

const list = (v: string) => v.split(/[;,\n]+/).map((x) => x.trim()).filter(Boolean);

export function ContactDrawer({ workspaceId, slug, contactId, canWrite, canErase, canExport, meId, onClose }: { workspaceId: string; slug: string; contactId: string; canWrite: boolean; canErase: boolean; canExport: boolean; meId: string; onClose: () => void }) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const locale = useLocale();
  const qc = useQueryClient();
  const members = useMembers(workspaceId);
  const companies = useCompanyOptions(workspaceId);
  const [activity, setActivity] = useState<ActivityDto["type"] | null>(null);
  const [erasing, setErasing] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!members.data) return;
    useMapStore.setState({ people: Object.fromEntries(members.data.map((m) => [m.id, { id: m.id, name: m.name, email: m.email, avatar: null, image: null }])), meId, workspaceId });
  }, [members.data, meId, workspaceId]);

  const { data: c, isError } = useQuery({ queryKey: ["contact", contactId], queryFn: () => api.get<ContactDetail>(`/api/v1/contacts/${contactId}`) });
  const { data: node } = useQuery({ queryKey: ["node", contactId], queryFn: () => api.get<NodeDetail>(`/api/v1/nodes/${contactId}`) });
  const feed = useQuery({ queryKey: ["activities", "contact", contactId], queryFn: () => api.get<Paged<ActivityDto & { dealTitle: string | null }>>(`/api/v1/workspaces/${workspaceId}/activities?contactId=${contactId}&pageSize=30`) });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["contact", contactId] });
    void qc.invalidateQueries({ queryKey: ["node", contactId] });
    void qc.invalidateQueries({ queryKey: ["activities", "contact", contactId] });
    void qc.invalidateQueries({ queryKey: ["contacts"] });
  };
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/v1/contacts/${contactId}`, body),
    onSuccess: () => (setError(null), refresh()),
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("error")),
  });
  const consent = useMutation({ mutationFn: (given: boolean) => api.put(`/api/v1/contacts/${contactId}/consent`, { given, source: "manual" }), onSuccess: refresh });

  async function exportData() {
    const res = await fetch(`/api/v1/contacts/${contactId}/gdpr-export`);
    if (!res.ok) return setError(t("error"));
    const url = URL.createObjectURL(new Blob([JSON.stringify(await res.json(), null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `contact-${contactId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const erase = useMutation({
    mutationFn: () => api.post(`/api/v1/contacts/${contactId}/gdpr-erase`, { confirm }),
    onSuccess: () => {
      setErasing(false);
      onClose();
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("error")),
  });

  const shell = "z-40 w-[440px] shrink-0 overflow-y-auto border-l border-border bg-card max-md:fixed max-md:inset-0 max-md:w-full";
  if (isError) return <aside className={`${shell} p-4 text-sm text-muted-foreground`}>{t("contactGone")}</aside>;
  if (!c) return <aside className={`${shell} p-4 text-sm text-muted-foreground`}>…</aside>;
  const dis = !canWrite;
  const cold = !c.lastContactedAt || Date.now() - new Date(c.lastContactedAt).getTime() > 30 * 86_400_000;

  return (
    <aside data-testid="contact-drawer" className={`${shell} flex flex-col`}>
      <header className="flex items-start gap-2 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">
            {c.companyId ? (
              <Link href={`/w/${slug}/crm/companies/${c.companyId}`} className="hover:underline">
                {c.companyName}
              </Link>
            ) : (
              t("noCompany")
            )}
          </div>
          <h2 className="mt-1 text-lg font-semibold">{c.name}</h2>
          <div className={cold ? "text-xs text-[var(--health-yellow)]" : "text-xs text-muted-foreground"}>
            {c.lastContactedAt ? t("lastContact", { date: new Date(c.lastContactedAt).toLocaleDateString(locale) }) : t("neverContacted")}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={t("close")}>
          <X className="size-4" />
        </Button>
      </header>
      {error && (
        <p role="alert" className="mx-4 mb-2 text-sm text-danger">
          {error}
        </p>
      )}

      {canWrite && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          <Button size="sm" variant="outline" onClick={() => setActivity("CALL")}>
            <Phone className="size-4" />
            {t("logCall")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setActivity("EMAIL")}>
            <Mail className="size-4" />
            {t("logEmail")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setActivity("NOTE")}>
            <StickyNote className="size-4" />
            {t("addNote")}
          </Button>
        </div>
      )}

      <Section title={t("details")}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <FormField label={t("field.firstName")}>
            <Input disabled={dis} defaultValue={c.firstName} key={`f${c.firstName}`} onBlur={(e) => e.target.value.trim() && e.target.value !== c.firstName && patch.mutate({ firstName: e.target.value.trim() })} />
          </FormField>
          <FormField label={t("field.lastName")}>
            <Input disabled={dis} defaultValue={c.lastName ?? ""} key={`l${c.lastName}`} onBlur={(e) => e.target.value !== (c.lastName ?? "") && patch.mutate({ lastName: e.target.value })} />
          </FormField>
          <FormField label={t("field.position")}>
            <Input disabled={dis} defaultValue={c.position ?? ""} key={`p${c.position}`} onBlur={(e) => e.target.value !== (c.position ?? "") && patch.mutate({ position: e.target.value })} />
          </FormField>
          <FormField label={t("company")}>
            <select className={selectClass} disabled={dis} value={c.companyId ?? ""} onChange={(e) => patch.mutate({ companyId: e.target.value || null })}>
              <option value="">—</option>
              {companies.data?.items.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.legalName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t("field.email")}>
            <Input disabled={dis} defaultValue={c.emails.join(", ")} key={`e${c.emails.join()}`} onBlur={(e) => e.target.value !== c.emails.join(", ") && patch.mutate({ emails: list(e.target.value) })} />
          </FormField>
          <FormField label={t("field.phone")}>
            <Input disabled={dis} defaultValue={c.phones.join(", ")} key={`ph${c.phones.join()}`} onBlur={(e) => e.target.value !== c.phones.join(", ") && patch.mutate({ phones: list(e.target.value) })} />
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
          <FormField label={t("birthday")}>
            <Input type="date" disabled={dis} value={dayInput(c.birthday)} onChange={(e) => patch.mutate({ birthday: dayToIso(e.target.value)?.slice(0, 10) ?? null })} />
          </FormField>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {(["telegram", "whatsapp", "instagram"] as const).map((m) => (
            <FormField key={m} label={t(`field.${m}`)}>
              <Input disabled={dis} defaultValue={c.messengers[m] ?? ""} key={`${m}${c.messengers[m]}`} onBlur={(e) => e.target.value !== (c.messengers[m] ?? "") && patch.mutate({ messengers: { [m]: e.target.value } })} />
              {c.messengers[m] && (
                <a className="text-xs text-primary hover:underline" href={messengerLinks[m]?.(c.messengers[m] as string)} target="_blank" rel="noopener noreferrer">
                  {t("open")} ↗
                </a>
              )}
            </FormField>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {c.emails.map((e) => (
            <a key={e} className="text-primary hover:underline" href={`mailto:${e}`}>
              {e}
            </a>
          ))}
          {c.phones.map((p) => (
            <a key={p} className="text-primary hover:underline" href={`tel:${p.replace(/[^\d+]/g, "")}`}>
              {p}
            </a>
          ))}
        </div>
      </Section>

      <Section title={t("consent")}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={dis || consent.isPending} checked={c.consentGiven} onChange={(e) => consent.mutate(e.target.checked)} />
          {t("consentGiven")}
          {c.consentAt && c.consentGiven && <span className="text-xs text-muted-foreground">({new Date(c.consentAt).toLocaleDateString(locale)})</span>}
        </label>
        {c.consentHistory.length > 0 && (
          <ul className="text-xs text-muted-foreground">
            {c.consentHistory.map((h) => (
              <li key={h.id}>
                {new Date(h.givenAt).toLocaleDateString(locale)} · {h.source ?? "—"}
                {h.revokedAt && ` · ${t("revoked", { date: new Date(h.revokedAt).toLocaleDateString(locale) })}`}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t("tabPipeline")}>
        {c.deals.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noDeals")}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {c.deals.map((d) => (
              <li key={d.id}>
                <Link href={`/w/${slug}/crm?deal=${d.id}`} className="hover:underline">
                  {d.title}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {d.stage} · {money(d.amount, d.currency, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t("tags")}>
        <NodeTags nodeId={contactId} workspaceId={workspaceId} current={c.tags} canWrite={canWrite} onChange={refresh} />
      </Section>

      <Section title={t("activityFeed")}>
        {feed.data?.items.length === 0 && <p className="text-sm text-muted-foreground">{t("noActivities")}</p>}
        <ul className="flex flex-col gap-2 text-sm">
          {feed.data?.items.map((a) => (
            <li key={a.id}>
              <span className="font-medium">{a.subject}</span>
              <span className="block text-xs text-muted-foreground">
                {t(`activity.${a.type}`)} · {new Date(a.completedAt ?? a.dueAt ?? a.createdAt).toLocaleString(locale)}
                {a.dealTitle ? ` · ${a.dealTitle}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("comments")}>
        <Comments nodeId={contactId} meId={meId} canComment />
      </Section>
      <Section title={t("files")}>
        <Attachments nodeId={contactId} items={node?.attachments ?? []} canWrite={canWrite} onChange={refresh} />
      </Section>

      {(canExport || canErase) && (
        <Section title={t("privacy")}>
          <div className="flex flex-wrap gap-2">
            {canExport && (
              <Button size="sm" variant="outline" onClick={exportData}>
                <Download className="size-4" />
                {t("exportPersonalData")}
              </Button>
            )}
            {canErase && (
              <Button size="sm" variant="danger" onClick={() => setErasing(true)}>
                <ShieldAlert className="size-4" />
                {t("erase")}
              </Button>
            )}
          </div>
        </Section>
      )}

      <ActivityDialog open={activity !== null} onClose={() => setActivity(null)} workspaceId={workspaceId} defaults={{ type: activity ?? "CALL", contactId, companyId: c.companyId }} onSaved={refresh} />
      <Modal open={erasing} onClose={() => (setErasing(false), setConfirm(""))} title={t("eraseTitle", { name: c.name })}>
        <p className="text-sm">{t("eraseBody")}</p>
        <FormField label={t("eraseConfirm")}>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" placeholder="ERASE" />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => (setErasing(false), setConfirm(""))}>
            {tc("cancel")}
          </Button>
          <Button variant="danger" disabled={confirm !== "ERASE" || erase.isPending} onClick={() => erase.mutate()}>
            {t("eraseForever")}
          </Button>
        </div>
      </Modal>
    </aside>
  );
}
