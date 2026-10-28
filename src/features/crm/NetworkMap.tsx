"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/features/mindmap/api";
import { buildNetwork, filterPeople, NET_MODES, NO_FILTERS, ROOT_ID, STAGE_COLOR, type NetFilters, type NetGroup, type NetMode, type NetNode, type NetPerson } from "@/modules/crm/network";
import { cn } from "@/lib/utils";
import { selectClass } from "@/components/ui/modal";
import { ContactDrawer } from "./ContactDrawer";
import { TreeMap, type TreeMapNode } from "./TreeMap";

interface NetworkData {
  rootName: string;
  people: NetPerson[];
  groups: NetGroup[];
  truncated: boolean;
  total: number;
}

const WARM_ICON: Record<string, string> = { HOT: "🔥", WARM: "🟡", COLD: "❄️" };
const LOST = new Set(["DECLINED", "NO_REPLY"]);

/**
 * The whole network on one map, with you in the middle. Three ways to arrange it: by sponsors (who brought whom),
 * by groups (how the list was split) and by who works with whom (what was handed to partners). Colour is the funnel stage.
 */
export function NetworkMap({ workspaceId, slug, canWrite, canExport, canErase, meId }: { workspaceId: string; slug: string; canWrite: boolean; canExport: boolean; canErase: boolean; meId: string }) {
  const t = useTranslations("crm");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const openId = search.get("contact");
  const modeParam = search.get("mode");
  const mode: NetMode = (NET_MODES as string[]).includes(modeParam ?? "") ? (modeParam as NetMode) : "sponsors";
  const [showPeople, setShowPeople] = useState(true);
  const [hideLost, setHideLost] = useState(true);
  const [filters, setFilters] = useState<NetFilters>(NO_FILTERS);
  const [split, setSplit] = useState(false);
  const [depth, setDepth] = useState(0);
  const setFilter = (patch: Partial<NetFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const filtered = filters.hideNoSponsor || filters.stage !== null || filters.temperature !== null || split || depth > 0;
  const sponsorsMode = mode === "sponsors";
  const { data, isLoading, isError } = useQuery({ queryKey: ["network", workspaceId], staleTime: 15_000, queryFn: () => api.get<NetworkData>(`/api/v1/workspaces/${workspaceId}/network`) });

  const setParam = (name: string, value: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const { nodes, shown } = useMemo(() => {
    if (!data) return { nodes: [] as TreeMapNode[], shown: 0 };
    const active = sponsorsMode ? filters : { ...filters, hideNoSponsor: false };
    const people = filterPeople(hideLost ? data.people.filter((p) => !LOST.has(p.stage)) : data.people, active);
    const net = buildNetwork(mode, { rootName: data.rootName, people, groups: data.groups }, { showPeople, split: sponsorsMode && split, maxDepth: sponsorsMode && depth > 0 ? depth : null });
    const subtitle = (n: NetNode): string | undefined => {
      if (n.kind === "root") return t("netYou", { n: n.branch ?? 0 });
      if (n.kind === "group") return t("netBranch", { n: n.branch ?? 0 });
      const parts = [n.kind === "partner" ? t("funnelStage.PARTNER") : t(`funnelStage.${(n.stage ?? "NEW") as "NEW"}`), n.temperature ? WARM_ICON[n.temperature] : null, n.country, n.kind === "partner" && n.branch ? t("netBranch", { n: n.branch }) : null];
      return parts.filter(Boolean).join(" · ");
    };
    const title = (n: NetNode) => (n.synthetic === "noGroup" ? t("noGroup") : n.synthetic === "noSponsor" ? t("netNoSponsor") : n.synthetic === "nobody" ? t("heldNobody") : n.title);
    const out: TreeMapNode[] = net.map((n) => ({
      id: n.id,
      parentId: n.parentId,
      position: n.position,
      kind: n.kind === "person" ? "contact" : n.kind,
      title: title(n),
      subtitle: subtitle(n),
      accent: n.kind === "group" ? (n.color ?? "var(--muted-foreground)") : n.stage ? STAGE_COLOR[n.stage] : null,
      closed: n.stage ? LOST.has(n.stage) : false,
      side: n.side,
    }));
    return { nodes: out, shown: net.filter((n) => n.kind === "person" || n.kind === "partner").length };
  }, [data, mode, showPeople, hideLost, filters, split, depth, sponsorsMode, t]);

  const pill = (on: boolean) => cn("h-8 rounded-full border px-3 text-sm", on ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground hover:bg-muted");

  return (
    <div className="flex h-full flex-col gap-3 p-4" data-testid="network-map">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold">{t("networkTitle")}</h1>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("netArrange")}>
          {NET_MODES.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} data-testid={`mode-${m}`} className={pill(mode === m)} onClick={() => setParam("mode", m === "sponsors" ? null : m)}>
              {t(`netMode.${m}`)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button type="button" aria-pressed={showPeople} className={pill(showPeople)} onClick={() => setShowPeople((v) => !v)} data-testid="toggle-people">
            {t("netShowPeople")}
          </button>
          <button type="button" aria-pressed={hideLost} className={pill(hideLost)} onClick={() => setHideLost((v) => !v)} data-testid="toggle-lost">
            {t("netHideLost")}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" data-testid="network-filters" title={t("netFiltersHint")}>
        {sponsorsMode && (
          <button type="button" aria-pressed={filters.hideNoSponsor} className={pill(filters.hideNoSponsor)} onClick={() => setFilter({ hideNoSponsor: !filters.hideNoSponsor })} data-testid="toggle-no-sponsor">
            {t("netHideNoSponsor")}
          </button>
        )}
        {sponsorsMode && (
          <button type="button" aria-pressed={split} className={pill(split)} onClick={() => setSplit((v) => !v)} data-testid="toggle-split">
            {t("netSplit")}
          </button>
        )}
        <select className={cn(selectClass, "h-8 w-40 rounded-full")} aria-label={t("netStageFilter")} value={filters.stage ?? ""} onChange={(e) => setFilter({ stage: e.target.value || null })} data-testid="filter-stage">
          <option value="">{t("netStageAll")}</option>
          {(["NEW", "FIRST_CONTACT", "WARMING", "PRESENTATION", "DECIDING", "CLIENT"] as const).map((s) => (
            <option key={s} value={s}>
              {t(`funnelStage.${s}`)}
            </option>
          ))}
        </select>
        <select className={cn(selectClass, "h-8 w-40 rounded-full")} aria-label={t("netWarmFilter")} value={filters.temperature ?? ""} onChange={(e) => setFilter({ temperature: e.target.value || null })} data-testid="filter-warmth">
          <option value="">{t("netWarmAll")}</option>
          {(["HOT", "WARM", "COLD"] as const).map((w) => (
            <option key={w} value={w}>
              {WARM_ICON[w]} {t(`temp.${w}`)}
            </option>
          ))}
        </select>
        {sponsorsMode && (
          <select className={cn(selectClass, "h-8 w-40 rounded-full")} aria-label={t("netDepth")} value={depth} onChange={(e) => setDepth(Number(e.target.value))} data-testid="filter-depth">
            <option value={0}>{t("netDepthAll")}</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {t("netDepthN", { n })}
              </option>
            ))}
          </select>
        )}
        {filtered && (
          <button type="button" className="h-8 rounded-full px-3 text-sm text-primary hover:underline" onClick={() => (setFilters(NO_FILTERS), setSplit(false), setDepth(0))} data-testid="filters-reset">
            {t("netReset")}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="network-legend">
        {(["NEW", "FIRST_CONTACT", "WARMING", "PRESENTATION", "DECIDING", "CLIENT", "PARTNER"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-full" style={{ background: STAGE_COLOR[s] }} aria-hidden />
            {t(`funnelStage.${s}`)}
          </span>
        ))}
        {data && <span className="ml-auto tabular-nums">{t("netShown", { n: shown })}</span>}
      </div>
      {data?.truncated && <p className="text-xs text-[var(--health-yellow)]">{t("netTruncated", { n: data.people.length, total: data.total })}</p>}
      {isError && (
        <p role="alert" className="text-sm text-danger">
          {t("error")}
        </p>
      )}

      <div className="min-h-96 flex-1 overflow-hidden rounded-lg border border-border bg-card" data-testid="network-canvas">
        {isLoading ? <Skeleton className="m-4 h-[calc(100%-2rem)] rounded-xl" /> : data && data.people.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{t("netEmpty")}</p> : <TreeMap key={`${mode}-${showPeople}-${hideLost}-${JSON.stringify(filters)}-${split}-${depth}`} nodes={nodes} heatmap={false} onOpen={(n) => (n.kind === "contact" || n.kind === "partner") && n.id !== ROOT_ID && setParam("contact", n.id)} />}
      </div>

      {openId && <ContactDrawer key={openId} workspaceId={workspaceId} slug={slug} contactId={openId} canWrite={canWrite} canErase={canErase} canExport={canExport} meId={meId} onClose={() => setParam("contact", null)} />}
    </div>
  );
}
