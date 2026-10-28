"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCopy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FormField, selectClass, textareaClass } from "@/components/ui/modal";
import { api } from "@/features/mindmap/api";
import { handoffText, type HandoffCard } from "@/modules/crm/partners";
import { useMembers } from "./hooks";
import { usePartners } from "./usePartners";

export interface TransferRow {
  id: string;
  at: string;
  from: string | null;
  to: string | null;
  note: string | null;
  by: string | null;
}

/**
 * The partner side of a person's card: whose line they are in (the sponsor), which partner works with them now, the history of hand-overs,
 * and, for a partner without an account, the handoff card to paste into a messenger.
 */
export function PartnerFields({ workspaceId, meId, contactId, stage, sponsorId, heldById, linkedUserId, transfers, disabled, onPatch }: { workspaceId: string; meId: string; contactId: string; stage: string; sponsorId: string | null; heldById: string | null; linkedUserId: string | null; transfers: TransferRow[]; disabled: boolean; onPatch: (patch: Record<string, unknown>) => void }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  const qc = useQueryClient();
  const partners = usePartners(workspaceId);
  const members = useMembers(workspaceId);
  const [card, setCard] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const others = (partners.data ?? []).filter((p) => p.id !== contactId);
  const holder = partners.data?.find((p) => p.id === heldById);
  // The signed-in person can be picked too, as their account: the link behind it is made the first time they choose it, and it never shows up as a person to work with.
  const mine = partners.data?.find((p) => p.linkedUserId === meId);
  const ME = "__me__";
  const label = (p: { name: string; linkedUserId: string | null }) => (p.linkedUserId === meId ? `${p.name} (${t("me")})` : p.name);
  const myCard = useMutation({
    mutationFn: () => api.post<{ id: string }>(`/api/v1/workspaces/${workspaceId}/partners/me`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["partners"] }),
  });

  const hand = useMutation({
    mutationFn: (toPartnerId: string | null) => api.post(`/api/v1/workspaces/${workspaceId}/people/transfer`, { ids: [contactId], toPartnerId }),
    onSuccess: () => {
      for (const k of ["contact", "people", "partners", "activities"]) void qc.invalidateQueries({ queryKey: [k] });
    },
  });

  const make = useMutation({
    mutationFn: () => api.get<HandoffCard>(`/api/v1/contacts/${contactId}/handoff`),
    onSuccess: (c) => {
      setCopied(false);
      setCard(
        handoffText(
          c,
          { stage: t("field.stage"), warmth: t("field.temperature"), phone: t("handoff.phone"), email: t("handoff.email"), country: t("field.country"), source: t("field.source"), interests: t("field.interests"), nextStep: t("field.nextStep"), group: t("groupField"), notes: t("handoff.notes") },
          t(`funnelStage.${c.stage as "NEW"}`),
          c.temperature ? t(`temp.${c.temperature as "HOT"}`) : null,
        ),
      );
    },
  });

  const copy = async () => {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const day = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="partner-fields">
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t("sponsor")}>
          <select disabled={disabled || myCard.isPending} className={selectClass} value={sponsorId ?? ""} onChange={async (e) => onPatch({ sponsorId: e.target.value === ME ? (await myCard.mutateAsync()).id : e.target.value || null })} data-testid="sponsor-select">
            <option value="">—</option>
            {!mine && partners.data && <option value={ME}>{t("meCard")}</option>}
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {label(p)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t("heldBy")}>
          <select disabled={disabled || hand.isPending || myCard.isPending} className={selectClass} value={heldById ?? ""} onChange={async (e) => hand.mutate(e.target.value === ME ? (await myCard.mutateAsync()).id : e.target.value || null)} data-testid="held-select">
            <option value="">{t("heldNobody")}</option>
            {!mine && partners.data && <option value={ME}>{t("meCard")}</option>}
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {label(p)}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      {partners.data && partners.data.length === 0 && <p className="text-xs text-muted-foreground">{t("noPartnersYet")}</p>}

      {stage === "PARTNER" && (
        <FormField label={t("linkedAccount")} hint={t("linkedAccountHint")}>
          <select disabled={disabled} className={selectClass} value={linkedUserId ?? ""} onChange={(e) => onPatch({ linkedUserId: e.target.value || null })} data-testid="linked-select">
            <option value="">{t("noAccount")}</option>
            {members.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => make.mutate()} disabled={make.isPending} data-testid="make-handoff">
          <ClipboardCopy className="size-4" />
          {holder ? t("handoff.forPartner", { name: holder.name }) : t("handoff.make")}
        </Button>
      </div>
      {card !== null && (
        <div className="flex flex-col gap-2" data-testid="handoff-card">
          <textarea readOnly className={`${textareaClass} min-h-40 font-mono text-xs`} value={card} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => void copy()}>
              {t("handoff.copy")}
            </Button>
            {copied && <span className="text-xs text-muted-foreground">{t("handoff.copied")}</span>}
          </div>
        </div>
      )}

      {transfers.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">{t("transferHistory")}</div>
          <ul className="flex flex-col gap-1" data-testid="transfer-history">
            {transfers.map((x) => (
              <li key={x.id} className="rounded-md bg-muted/60 px-2 py-1 text-xs">
                <span className="tabular-nums text-muted-foreground">{day(x.at)}</span>{" "}
                {x.to ? t("transferTo", { from: x.from ?? t("heldNobody"), to: x.to }) : t("transferBack", { from: x.from ?? t("heldNobody") })}
                {x.by ? <span className="text-muted-foreground"> · {x.by}</span> : null}
                {x.note ? <div className="text-muted-foreground">{x.note}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
