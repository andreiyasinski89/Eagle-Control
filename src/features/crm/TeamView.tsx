"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UserCheck, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { groupTree, type GroupNode } from "@/modules/crm/groups";
import { cn } from "@/lib/utils";
import { ContactDrawer } from "./ContactDrawer";
import { ReferralCard } from "./ReferralCard";
import { usePartners, type PartnerDto } from "./usePartners";

/**
 * The team: every partner under their sponsor, with the people they hold and the size of their line.
 * A partner card opens the person; the counts say where to look next (who holds many people, whose line is growing).
 */
export function TeamView({ workspaceId, slug, canWrite, canExport, canErase, meId }: { workspaceId: string; slug: string; canWrite: boolean; canExport: boolean; canErase: boolean; meId: string }) {
  const t = useTranslations("crm");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const openId = search.get("contact");
  const { data, isLoading, isError } = usePartners(workspaceId);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const tree = groupTree((data ?? []).map((p) => ({ ...p, position: 0 })));

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (id) next.set("contact", id);
    else next.delete("contact");
    router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
  };
  const toggle = (id: string) => setFolded((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));

  const row = (n: GroupNode<PartnerDto & { position: number }>) => {
    const p = n.group;
    const closed = folded.has(p.id);
    return (
      <li key={p.id}>
        <div className={cn("flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm", openId === p.id ? "border-primary ring-1 ring-primary" : "border-border")} style={{ marginLeft: `${(n.depth - 1) * 24}px` }} data-testid="partner-row" data-partner={p.id}>
          {n.children.length > 0 ? (
            <button type="button" aria-expanded={!closed} aria-label={closed ? t("expand") : t("collapse")} className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted" onClick={() => toggle(p.id)}>
              {closed ? "▸" : "▾"}
            </button>
          ) : (
            <span className="size-5" aria-hidden />
          )}
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(p.id)}>
            <span className="font-medium">{p.name}</span>
            {p.country && <span className="ml-2 text-xs text-muted-foreground">{p.country}</span>}
            {p.linkedUserId && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary" title={p.linkedUserName ?? ""}>
                <UserCheck className="size-3" aria-hidden />
                {t("hasAccount")}
              </span>
            )}
          </button>
          <span className="flex shrink-0 items-center gap-3 text-xs tabular-nums text-muted-foreground">
            <span title={t("teamHeld")}>
              {t("teamHeldShort")} <b className="text-foreground">{p.held}</b>
            </span>
            <span title={t("teamLine")} className="inline-flex items-center gap-1">
              <Users className="size-3.5" aria-hidden />
              <b className="text-foreground">{p.team}</b>
            </span>
            <span title={t("teamPartners")}>
              {t("teamPartnersShort")} <b className="text-foreground">{p.partnersBelow}</b>
            </span>
          </span>
        </div>
        {!closed && n.children.length > 0 && <ul className="mt-1.5 flex flex-col gap-1.5">{n.children.map(row)}</ul>}
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4" data-testid="team-view">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold">{t("teamTitle")}</h1>
        {data && <span className="text-sm text-muted-foreground">{t("teamCount", { n: data.length })}</span>}
      </div>
      {canWrite && <ReferralCard workspaceId={workspaceId} />}
      {isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
      {isError && (
        <p role="alert" className="text-sm text-danger">
          {t("error")}
        </p>
      )}
      {data && data.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card p-10 text-center" data-testid="team-empty">
          <span className="text-4xl" aria-hidden>
            🦉
          </span>
          <p className="font-medium">{t("teamEmptyTitle")}</p>
          <p className="max-w-md text-sm text-muted-foreground">{t("teamEmpty")}</p>
        </div>
      )}
      {data && data.length > 0 && <ul className="flex flex-col gap-1.5">{tree.map(row)}</ul>}
      {openId && <ContactDrawer key={openId} workspaceId={workspaceId} slug={slug} contactId={openId} canWrite={canWrite} canErase={canErase} canExport={canExport} meId={meId} onClose={() => setOpen(null)} />}
    </div>
  );
}
