"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, ExternalLink, GraduationCap, MessageCircle, Settings2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiFailure } from "@/features/mindmap/api";
import type { OnboardingProgress } from "@/modules/crm/onboarding-plan";
import { Link } from "@/i18n/navigation";
import { DEFAULT_DEPTH, filterTree, MAX_DEPTH, NO_MAP_FILTERS, type Heat, type HeatSettings, type MapFilters } from "@/modules/crm/team-tree";
import { cn } from "@/lib/utils";
import { ContactDrawer } from "./ContactDrawer";
import { ScheduleDialog } from "./ScheduleDialog";
import { TreeMap, type TreeMapNode } from "./TreeMap";

interface TeamNode {
  id: string;
  parentId: string | null;
  level: number;
  name: string;
  city: string | null;
  country: string | null;
  since: string;
  hasAccount: boolean;
  heat: Heat;
  lastAt: string | null;
  touches7: number;
  meetings7: number;
  invited: number;
  team: number;
  hasMore: boolean;
  onboarding: OnboardingProgress | null;
  telegram: string | null;
  whatsapp: string | null;
  phone: string | null;
}
interface TeamTreeData {
  rootId: string | null;
  selfId: string | null;
  nodes: TeamNode[];
  settings: HeatSettings;
  truncated: boolean;
  total: number;
}

const ME = "__me";
const HEAT_KEY: Record<Heat, "GREEN" | "YELLOW" | "RED"> = { green: "GREEN", yellow: "YELLOW", red: "RED" };
const HEATS: Heat[] = ["green", "yellow", "red"];
const DAY = 86_400_000;

/** A link that opens a chat with the partner, from what the card has. */
function writeLink(n: TeamNode): string | null {
  const tg = n.telegram?.replace(/^@/, "").trim();
  if (tg) return `https://t.me/${tg}`;
  const wa = n.whatsapp?.replace(/\D/g, "");
  if (wa) return `https://wa.me/${wa}`;
  return n.phone ? `tel:${n.phone.replace(/[^\d+]/g, "")}` : null;
}

/**
 * "My team": the partners as a mind map with you in the middle. Each card carries the numbers of the week and a colour from the last sign of work
 * (green at work, yellow slowed down, red quiet), the first levels are open and deeper lines open on a click. A click on a card opens the panel of the partner.
 */
export function TeamMap({ workspaceId, slug, canWrite, canExport, canErase, canLead, meId }: { workspaceId: string; slug: string; canWrite: boolean; canExport: boolean; canErase: boolean; canLead: boolean; meId: string }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const qc = useQueryClient();
  const openId = search.get("contact");
  const [depth, setDepth] = useState(DEFAULT_DEPTH);
  const [filters, setFilters] = useState<MapFilters>(NO_MAP_FILTERS);
  const [selected, setSelected] = useState<string | null>(null);
  const [branches, setBranches] = useState<Record<string, TeamNode[]>>({});
  const [loadingBranch, setLoadingBranch] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({ queryKey: ["team-tree", workspaceId, depth], staleTime: 15_000, queryFn: () => api.get<TeamTreeData>(`/api/v1/workspaces/${workspaceId}/team-tree?depth=${depth}`) });

  const setParam = (name: string, value: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  // The levels loaded by the click are put under the partner they belong to, and count on from that partner's level.
  const all = useMemo<TeamNode[]>(() => {
    if (!data) return [];
    const out = new Map(data.nodes.map((n) => [n.id, n]));
    for (const [rootId, list] of Object.entries(branches)) {
      const base = out.get(rootId)?.level ?? 0;
      if (out.has(rootId)) out.set(rootId, { ...out.get(rootId)!, hasMore: false });
      for (const n of list) if (!out.has(n.id)) out.set(n.id, { ...n, level: base + n.level, parentId: n.parentId ?? rootId });
    }
    return [...out.values()];
  }, [data, branches]);

  const cities = useMemo(() => [...new Set(all.map((n) => (n.city ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [all]);
  const maxLevel = Math.max(1, ...all.map((n) => n.level));
  const shown = useMemo(() => filterTree(all, filters), [all, filters]);
  const counts = useMemo(() => Object.fromEntries(HEATS.map((h) => [h, all.filter((n) => n.heat === h).length])) as Record<Heat, number>, [all]);
  const date = (iso: string) => new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  const agoText = (iso: string | null) => {
    if (!iso) return t("teamMapNever");
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
    return d <= 0 ? t("teamMapToday") : t("teamMapDaysAgo", { n: d });
  };

  const nodes = useMemo<TreeMapNode[]>(() => {
    if (!data || all.length === 0) return [];
    const root: TreeMapNode = { id: ME, parentId: null, position: 0, kind: "root", title: t("teamMapYou"), subtitle: t("teamMapLine", { n: all.length }) };
    const rest = shown.map(({ node: n, path }, i): TreeMapNode => ({
      id: n.id,
      parentId: n.parentId ?? ME,
      position: i,
      kind: "partner",
      title: n.name,
      subtitle: [n.city || n.country, t("teamMapSince", { date: date(n.since) }), n.onboarding ? t("onbShort", { n: n.onboarding.percent }) : null].filter(Boolean).join(" · "),
      detail: n.hasMore ? t("teamMapDetailMore", { touches: n.touches7, meetings: n.meetings7, n: n.team }) : t("teamMapDetail", { touches: n.touches7, meetings: n.meetings7, invited: n.invited }),
      health: HEAT_KEY[n.heat],
      warning: n.heat === "red",
      closed: path,
    }));
    return [root, ...rest];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `date` follows the locale
  }, [data, all, shown, t, locale]);

  const sel = selected ? all.find((n) => n.id === selected) : undefined;
  const link = sel ? writeLink(sel) : null;

  const startOnboarding = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/workspaces/${workspaceId}/partners/${id}/onboarding`, { locale }),
    onSuccess: () => {
      setStartError(null);
      void qc.invalidateQueries({ queryKey: ["team-tree"] });
      setBranches({});
    },
    onError: (e) => setStartError(e instanceof ApiFailure ? (e.code === "plan_limit" ? t("planLimit") : e.message) : t("error")),
  });

  const openBranch = async (id: string) => {
    setLoadingBranch(id);
    try {
      const r = await api.get<TeamTreeData>(`/api/v1/workspaces/${workspaceId}/team-tree?root=${encodeURIComponent(id)}&depth=${DEFAULT_DEPTH}`);
      setBranches((b) => ({ ...b, [id]: r.nodes }));
    } finally {
      setLoadingBranch(null);
    }
  };

  const setFilter = (patch: Partial<MapFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const filtered = filters.level !== null || filters.city !== null || filters.heat !== null;
  const pill = (on: boolean) => cn("h-11 rounded-full border px-3 text-sm sm:h-8", on ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground hover:bg-muted");
  const select = cn(selectClass, "h-11 w-full rounded-full sm:h-8 sm:w-40");
  const dot: Record<Heat, string> = { green: "var(--health-green)", yellow: "var(--health-yellow)", red: "var(--health-red)" };

  return (
    <div className="flex h-full flex-col gap-3 p-4" data-testid="team-map">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 flex-1 text-xl font-semibold sm:flex-none">{t("teamMapTitle")}</h1>
        <p className="order-last w-full text-sm text-muted-foreground sm:order-none sm:w-auto sm:min-w-0 sm:flex-1">{t("teamMapHint")}</p>
        {canLead && (
          <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-8" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((v) => !v)} data-testid="heat-settings-toggle">
            <Settings2 className="size-4" />
            {t("teamMapThresholds")}
          </Button>
        )}
      </div>

      {settingsOpen && data && <ThresholdsPanel workspaceId={workspaceId} settings={data.settings} onSaved={() => void qc.invalidateQueries({ queryKey: ["team-tree"] })} />}

      <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center" data-testid="team-map-filters">
        <select className={select} aria-label={t("teamMapDepth")} value={depth} onChange={(e) => (setBranches({}), setDepth(Number(e.target.value)))} data-testid="team-depth">
          {Array.from({ length: MAX_DEPTH }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {t("teamMapDepthN", { n })}
            </option>
          ))}
        </select>
        <select className={select} aria-label={t("teamMapLevel")} value={filters.level ?? ""} onChange={(e) => setFilter({ level: e.target.value ? Number(e.target.value) : null })} data-testid="team-filter-level">
          <option value="">{t("teamMapLevelAll")}</option>
          {Array.from({ length: maxLevel }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {t("teamMapLevelN", { n })}
            </option>
          ))}
        </select>
        <select className={select} aria-label={t("teamMapCity")} value={filters.city ?? ""} onChange={(e) => setFilter({ city: e.target.value || null })} data-testid="team-filter-city">
          <option value="">{t("teamMapCityAll")}</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="col-span-2 flex flex-wrap items-center gap-1.5" role="group" aria-label={t("teamMapColour")}>
          {HEATS.map((h) => (
            <button key={h} type="button" aria-pressed={filters.heat === h} className={cn(pill(filters.heat === h), "inline-flex items-center gap-1.5")} onClick={() => setFilter({ heat: filters.heat === h ? null : h })} data-testid={`team-heat-${h}`}>
              <span className="size-2.5 rounded-full" style={{ background: dot[h] }} aria-hidden />
              {t(`teamMapHeat.${h}`)} <span className="tabular-nums text-muted-foreground">{counts[h]}</span>
            </button>
          ))}
          {filtered && (
            <button type="button" className="h-11 rounded-full px-3 text-sm text-primary hover:underline sm:h-8" onClick={() => setFilters(NO_MAP_FILTERS)} data-testid="team-filters-reset">
              {t("netReset")}
            </button>
          )}
        </div>
      </div>
      {data && <p className="text-xs text-muted-foreground">{t("teamMapLegend", { g: data.settings.greenDays, y: data.settings.yellowDays, w: data.settings.newcomerDays })}</p>}
      {data?.truncated && <p className="text-xs text-[var(--health-yellow)]">{t("teamMapTruncated", { n: data.nodes.length, total: data.total })}</p>}
      {isError && (
        <p role="alert" className="text-sm text-danger">
          {t("error")}
        </p>
      )}

      <div className="relative min-h-96 flex-1 overflow-hidden rounded-lg border border-border bg-card" data-testid="team-map-canvas">
        {isLoading ? (
          <Skeleton className="m-4 h-[calc(100%-2rem)] rounded-xl" />
        ) : data && all.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center" data-testid="team-map-empty">
            <span className="text-4xl" aria-hidden>
              🦉
            </span>
            <p className="font-medium">{t("teamEmptyTitle")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("teamEmpty")}</p>
            <Link href={`/w/${slug}/crm/people`} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground" data-testid="team-map-empty-cta">
              {t("teamEmptyCta")}
            </Link>
          </div>
        ) : (
          <TreeMap key={`${depth}-${JSON.stringify(filters)}-${Object.keys(branches).join(",")}`} nodes={nodes} heatmap onOpen={(n) => n.id !== ME && n.kind === "partner" && setSelected(n.id)} />
        )}
      </div>

      {sel && (
        <aside className="fixed inset-x-0 bottom-0 z-30 flex max-h-[80vh] flex-col gap-3 overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-96 sm:rounded-2xl" aria-label={sel.name} data-testid="team-panel">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold">{sel.name}</h2>
              <p className="text-xs text-muted-foreground">{[sel.city || sel.country, t("teamMapSince", { date: date(sel.since) })].filter(Boolean).join(" · ")}</p>
            </div>
            <button type="button" aria-label={t("close")} className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted" onClick={() => setSelected(null)} data-testid="team-panel-close">
              <X className="size-5" />
            </button>
          </div>
          <p className="flex items-center gap-2 text-sm" data-testid="team-panel-heat" data-heat={sel.heat}>
            <span className="size-3 rounded-full" style={{ background: dot[sel.heat] }} aria-hidden />
            {t(`teamMapHeat.${sel.heat}`)}: {agoText(sel.lastAt)}
          </p>
          <dl className="grid grid-cols-2 gap-2 text-center">
            {[
              { k: "teamMapTouches", v: sel.touches7 },
              { k: "teamMapMeetings", v: sel.meetings7 },
              { k: "teamMapInvited", v: sel.invited },
              { k: "teamMapTeam", v: sel.team },
            ].map((x) => (
              <div key={x.k} className="rounded-lg border border-border p-2">
                <dd className="text-xl font-semibold tabular-nums">{x.v}</dd>
                <dt className="text-xs text-muted-foreground">{t(x.k)}</dt>
              </div>
            ))}
          </dl>
          {sel.onboarding && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3" data-testid="team-panel-onboarding">
              <div className="flex items-center gap-2 text-sm font-medium">
                <GraduationCap className="size-4" aria-hidden />
                {t("onbTitle")}
                <span className="ml-auto tabular-nums">{sel.onboarding.percent}%</span>
              </div>
              <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span className="block h-full rounded-full bg-primary" style={{ width: `${sel.onboarding.percent}%` }} />
              </span>
              <p className="text-xs text-muted-foreground">{sel.onboarding.finished ? t("onbFinished") : t("onbNext", { title: sel.onboarding.next ?? "—", done: sel.onboarding.done, total: sel.onboarding.total })}</p>
              <Link href={`/w/${slug}/projects/p/${sel.onboarding.projectId}`} className="text-xs text-primary hover:underline" data-testid="team-panel-onboarding-open">
                {t("onbOpen")}
              </Link>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {canWrite && !sel.onboarding && sel.hasAccount && (
              <Button type="button" className="min-h-11" disabled={startOnboarding.isPending} onClick={() => startOnboarding.mutate(sel.id)} data-testid="team-panel-onboard">
                <GraduationCap className="size-4" />
                {t("onbStart")}
              </Button>
            )}
            {canWrite && !sel.onboarding && !sel.hasAccount && <p className="text-xs text-muted-foreground">{t("onbNoAccount")}</p>}
            {startError && (
              <p role="alert" className="text-xs text-danger">
                {startError}
              </p>
            )}
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground" data-testid="team-panel-write">
                <MessageCircle className="size-4" />
                {t("teamMapWrite")}
              </a>
            )}
            {canWrite && (
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setPlanning(true)} data-testid="team-panel-plan">
                <CalendarPlus className="size-4" />
                {t("teamMapPlan")}
              </Button>
            )}
            {sel.hasMore && (
              <Button type="button" variant="outline" className="min-h-11" disabled={loadingBranch === sel.id} onClick={() => void openBranch(sel.id)} data-testid="team-panel-expand">
                {t("teamMapExpand", { n: sel.team })}
              </Button>
            )}
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setParam("contact", sel.id)} data-testid="team-panel-card">
              <ExternalLink className="size-4" />
              {t("teamMapCard")}
            </Button>
          </div>
        </aside>
      )}
      {sel && <ScheduleDialog open={planning} onClose={() => setPlanning(false)} workspaceId={workspaceId} contactId={sel.id} companyId={null} contactName={sel.name} />}
      {openId && <ContactDrawer key={openId} workspaceId={workspaceId} slug={slug} contactId={openId} canWrite={canWrite} canErase={canErase} canExport={canExport} meId={meId} onClose={() => setParam("contact", null)} />}
    </div>
  );
}

/** How many days of silence turn a partner yellow and red, and when a newcomer who has not started turns red. */
function ThresholdsPanel({ workspaceId, settings, onSaved }: { workspaceId: string; settings: HeatSettings; onSaved: () => void }) {
  const t = useTranslations("crm");
  const [v, setV] = useState({ greenDays: String(settings.greenDays), yellowDays: String(settings.yellowDays), newcomerDays: String(settings.newcomerDays) });
  const [note, setNote] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/workspaces/${workspaceId}/team-heat`, { greenDays: Number(v.greenDays), yellowDays: Number(v.yellowDays), newcomerDays: Number(v.newcomerDays) }),
    onSuccess: () => (setNote(t("teamMapSaved")), onSaved()),
    onError: () => setNote(t("error")),
  });
  const field = (key: keyof typeof v, label: string) => (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <Input type="number" inputMode="numeric" min={1} max={90} className="h-11 sm:h-9" value={v[key]} onChange={(e) => setV((s) => ({ ...s, [key]: e.target.value }))} data-testid={`heat-${key}`} />
    </label>
  );
  return (
    <form
      className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-4 sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        setNote(null);
        save.mutate();
      }}
      data-testid="heat-settings"
    >
      {field("greenDays", t("teamMapGreenDays"))}
      {field("yellowDays", t("teamMapYellowDays"))}
      {field("newcomerDays", t("teamMapNewcomerDays"))}
      <Button type="submit" className="min-h-11 sm:min-h-9" disabled={save.isPending} data-testid="heat-save">
        {t("teamMapSave")}
      </Button>
      {note && (
        <p role="status" className="text-xs text-muted-foreground sm:col-span-4">
          {note}
        </p>
      )}
    </form>
  );
}
