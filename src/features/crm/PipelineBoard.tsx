"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { hub } from "@/features/realtime/hub";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Flame, LayoutGrid, Network, Plus, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/ui/modal";
import { columnTotals } from "@/modules/crm/deal-rules";
import { cn } from "@/lib/utils";
import { api, ApiFailure } from "@/features/mindmap/api";
import { DealDrawer } from "./DealDrawer";
import { TreeMap, type TreeMapNode } from "./TreeMap";
import { LoseDialog, NewDealDialog, WinProjectDialog } from "./DealDialogs";
import { initials, money, moneyLines, shortDate } from "./format";
import { memberName, useMembers, usePipelines } from "./hooks";
import type { BoardColumnDto, BoardDto, DealCardDto } from "./types";
import { SkeletonBoard } from "@/components/ui/skeleton";

interface MoveVars {
  dealId: string;
  stageId: string;
  afterId?: string | null;
  beforeId?: string | null;
  lostReasonId?: string | null;
}

/** Same placement rules as the server, applied to the cached board so the card lands instantly. */
export function applyMove(board: BoardDto, v: MoveVars): BoardDto {
  let card: DealCardDto | undefined;
  for (const c of board.columns) card = card ?? c.deals.find((d) => d.id === v.dealId);
  if (!card) return board;
  const target = board.columns.find((c) => c.id === v.stageId);
  if (!target) return board;
  const moved: DealCardDto = { ...card, stageId: target.id, status: target.isWon ? "won" : target.isLost ? "lost" : "open", probability: target.isWon ? 100 : target.isLost ? 0 : card.probability, daysInStage: card.stageId === target.id ? card.daysInStage : 0 };
  const columns = board.columns.map((c): BoardColumnDto => {
    let deals = c.deals.filter((d) => d.id !== v.dealId);
    if (c.id === target.id) {
      let idx = deals.length;
      if (v.afterId) idx = deals.findIndex((d) => d.id === v.afterId) + 1 || deals.length;
      else if (v.beforeId) {
        const i = deals.findIndex((d) => d.id === v.beforeId);
        idx = i >= 0 ? i : deals.length;
      }
      deals = [...deals.slice(0, idx), moved, ...deals.slice(idx)];
    }
    return { ...c, deals, totals: columnTotals(deals) };
  });
  return { ...board, columns };
}

function useDealParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const dealId = params.get("deal");
  const pipelineParam = params.get("pipeline");
  const set = useCallback(
    (key: "deal" | "pipeline", value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
  return { dealId, pipelineParam, set };
}

function Avatar({ name, email }: { name: string | null; email?: string }) {
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold" title={name ?? email}>
      {initials(name, email)}
    </span>
  );
}

function Card({ deal, owner, selected, onOpen, overlay }: { deal: DealCardDto; owner: { name: string | null; email: string } | null; selected: boolean; onOpen: () => void; overlay?: boolean }) {
  const t = useTranslations("crm");
  const tm = useTranslations("map");
  const locale = useLocale();
  const drag = useDraggable({ id: deal.id, data: { type: "card", stageId: deal.stageId } });
  const drop = useDroppable({ id: `card:${deal.id}`, data: { type: "card", dealId: deal.id, stageId: deal.stageId } });
  const noStep = deal.status === "open" && !deal.nextStep;
  return (
    <div
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      {...drag.attributes}
      {...drag.listeners}
      role="button"
      tabIndex={0}
      aria-label={deal.title}
      data-testid={`deal-${deal.id}`}
      data-health={deal.health}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={cn(
        "cursor-grab rounded-lg border border-border bg-card p-3 text-left shadow-sm outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/50",
        selected && "ring-2 ring-primary/50",
        drag.isDragging && !overlay && "opacity-30",
        overlay && "rotate-1 shadow-xl",
        drop.isOver && !drag.isDragging && "ring-2 ring-primary/30",
      )}
      style={{ borderLeftWidth: 4, borderLeftColor: deal.status === "open" ? `var(--health-${deal.health.toLowerCase()})` : "var(--border)" }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{deal.title}</div>
          {deal.companyName && <div className="truncate text-xs text-muted-foreground">{deal.companyName}</div>}
        </div>
        {owner && <Avatar name={owner.name} email={owner.email} />}
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span className="font-semibold tabular-nums">{money(deal.amount, deal.currency, locale)}</span>
        {deal.status === "open" && <span className="text-xs text-muted-foreground">{deal.probability}%</span>}
        {deal.expectedCloseDate && deal.status === "open" && <span className="ml-auto text-xs text-muted-foreground">{shortDate(deal.expectedCloseDate, locale)}</span>}
      </div>
      {noStep ? (
        <div className="mt-2 flex items-center gap-1 text-xs text-[var(--health-yellow)]">
          <AlertTriangle className="size-3" />
          {t("noNextStep")}
        </div>
      ) : (
        deal.nextStep &&
        deal.status === "open" && (
          <div className="mt-2 truncate text-xs text-muted-foreground" title={deal.nextStep}>
            ➜ {deal.nextStep}
            {deal.nextStepAt ? ` · ${shortDate(deal.nextStepAt, locale)}` : ""}
          </div>
        )
      )}
      {deal.status === "open" && deal.health === "RED" && <div className="mt-1 text-xs text-[var(--health-red)]">{tm("health.RED")} · {t("daysInStage", { count: deal.daysInStage })}</div>}
    </div>
  );
}

function Column({ col, owners, selectedId, onOpen, locale }: { col: BoardColumnDto; owners: (id: string | null) => { name: string | null; email: string } | null; selectedId: string | null; onOpen: (id: string) => void; locale: string }) {
  const t = useTranslations("crm");
  const drop = useDroppable({ id: col.id, data: { type: "column", stageId: col.id } });
  const amounts = Object.fromEntries(Object.entries(col.totals.byCurrency).map(([c, v]) => [c, v.amount]));
  const weighted = Object.fromEntries(Object.entries(col.totals.byCurrency).map(([c, v]) => [c, v.weighted]));
  return (
    <section
      ref={drop.setNodeRef}
      aria-label={col.name}
      data-testid={`column-${col.id}`}
      className={cn("flex w-72 shrink-0 flex-col rounded-xl bg-muted/50 p-2", drop.isOver && "ring-2 ring-primary/40", col.isWon && "bg-[var(--health-green)]/5", col.isLost && "bg-[var(--health-red)]/5")}
    >
      <header className="px-2 pb-2 pt-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{col.name}</h3>
          <span className="rounded-full bg-card px-2 text-xs tabular-nums" data-testid="column-count">
            {col.totals.count}
          </span>
        </div>
        <div className="mt-0.5 min-h-8 text-xs text-muted-foreground">
          {col.totals.count > 0 ? (
            <>
              <div data-testid="column-amount">{moneyLines(amounts, locale)}</div>
              {!col.isWon && !col.isLost && <div>{t("weighted")}: {moneyLines(weighted, locale)}</div>}
            </>
          ) : null}
        </div>
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-1">
        {col.deals.map((d) => (
          <Card key={d.id} deal={d} owner={owners(d.ownerId)} selected={selectedId === d.id} onOpen={() => onOpen(d.id)} />
        ))}
        {col.truncated && <p className="px-1 text-xs text-muted-foreground">{t("showingLatest")}</p>}
      </div>
    </section>
  );
}

export function PipelineBoard({ workspaceId, slug, canWrite, meId }: { workspaceId: string; slug: string; canWrite: boolean; meId: string }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  const qc = useQueryClient();
  const { dealId, pipelineParam, set } = useDealParam();
  const pipelines = usePipelines(workspaceId);
  const members = useMembers(workspaceId);
  const [owner, setOwner] = useState("");
  const [q, setQ] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [newDeal, setNewDeal] = useState(false);
  const [dragging, setDragging] = useState<DealCardDto | null>(null);
  const [lose, setLose] = useState<{ dealId: string; stageId?: string; beforeId?: string | null; afterId?: string | null } | null>(null);
  const [win, setWin] = useState<{ id: string; title: string } | null>(null);
  const [view, setView] = useState<"board" | "map">("board");
  const [heat, setHeat] = useState(true);

  // Other people's moves show up without a reload; my own are already on screen (optimistic).
  useEffect(
    () =>
      hub.subscribe([`board:${workspaceId}`], (e) => {
        if ((e.type === "board.changed" && e.actorId !== meId) || e.type === "reconnected") {
          void qc.invalidateQueries({ queryKey: ["board"] });
          if (dealId) void qc.invalidateQueries({ queryKey: ["deal", dealId] });
        }
      }),
    [workspaceId, meId, dealId, qc],
  );

  const pipeline = pipelines.data?.find((p) => p.id === pipelineParam) ?? pipelines.data?.find((p) => p.isDefault) ?? pipelines.data?.[0];
  const filters = useMemo(() => ({ owner, q }), [owner, q]);
  const board = useQuery({
    queryKey: ["board", pipeline?.id, filters],
    enabled: !!pipeline,
    queryFn: () => api.get<BoardDto>(`/api/v1/pipelines/${pipeline?.id}/board?${new URLSearchParams({ ...(owner ? { ownerId: owner } : {}), ...(q ? { q } : {}) })}`),
  });

  const move = useMutation({
    mutationFn: (v: MoveVars) => api.post(`/api/v1/deals/${v.dealId}/move`, { stageId: v.stageId, afterId: v.afterId, beforeId: v.beforeId, lostReasonId: v.lostReasonId }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["board"] });
      const prev = qc.getQueriesData<BoardDto>({ queryKey: ["board"] });
      for (const [key, data] of prev) if (data) qc.setQueryData(key, applyMove(data, v));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data));
      setNotice(e instanceof ApiFailure ? e.message : t("error"));
    },
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: ["board"] });
      void qc.invalidateQueries({ queryKey: ["deal", v.dealId] });
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const cols = useMemo(() => board.data?.columns ?? [], [board.data]);
  const ownerOf = useCallback((id: string | null) => (id ? (members.data?.find((m) => m.id === id) ?? null) : null), [members.data]);

  /** One entry point for "this deal wants to go to this stage", used by drag & drop and the drawer alike. */
  const requestMove = useCallback(
    (v: MoveVars) => {
      const target = cols.find((c) => c.id === v.stageId);
      if (!target) return;
      if (target.isLost) return setLose({ dealId: v.dealId, stageId: v.stageId, beforeId: v.beforeId, afterId: v.afterId });
      move.mutate(v, { onSuccess: () => target.isWon && setWin({ id: v.dealId, title: cols.flatMap((c) => c.deals).find((d) => d.id === v.dealId)?.title ?? "" }) });
    },
    [cols, move],
  );

  const onDragStart = (e: DragStartEvent) => setDragging(cols.flatMap((c) => c.deals).find((d) => d.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const { active, over } = e;
    if (!over || !canWrite) return;
    const dealIdActive = String(active.id);
    const data = over.data.current as { type: "column" | "card"; stageId: string; dealId?: string } | undefined;
    if (!data || data.dealId === dealIdActive) return;
    const column = cols.find((c) => c.id === data.stageId);
    if (!column) return;
    const from = cols.flatMap((c) => c.deals).find((d) => d.id === dealIdActive);
    if (data.type === "card") requestMove({ dealId: dealIdActive, stageId: data.stageId, beforeId: data.dealId });
    else {
      if (from?.stageId === data.stageId) return;
      const last = [...column.deals].reverse().find((d) => d.id !== dealIdActive);
      requestMove({ dealId: dealIdActive, stageId: data.stageId, afterId: last?.id ?? null });
    }
  };

  /** The same pipeline as a tree: pipeline → stages → deals, coloured by stagnation. */
  const mapNodes = useMemo<TreeMapNode[]>(() => {
    if (!pipeline) return [];
    const out: TreeMapNode[] = [{ id: `p:${pipeline.id}`, parentId: null, position: 0, kind: "pipeline", title: pipeline.name }];
    for (const c of cols) {
      const amounts = Object.fromEntries(Object.entries(c.totals.byCurrency).map(([cur, v]) => [cur, v.amount]));
      out.push({ id: `s:${c.id}`, parentId: `p:${pipeline.id}`, position: c.order, kind: "stage", title: c.name, subtitle: `${c.totals.count} · ${moneyLines(amounts, locale) || "—"}` });
      for (const d of c.deals) out.push({ id: d.id, parentId: `s:${c.id}`, position: d.position, kind: "deal", title: d.title, subtitle: `${money(d.amount, d.currency, locale)}${d.companyName ? ` · ${d.companyName}` : ""}`, health: d.status === "open" ? d.health : null, closed: d.status !== "open" });
    }
    return out;
  }, [pipeline, cols, locale]);

  const open = cols.filter((c) => !c.isWon && !c.isLost);
  const openTotals = columnTotals(open.flatMap((c) => c.deals));
  const openAmount = Object.fromEntries(Object.entries(openTotals.byCurrency).map(([c, v]) => [c, v.amount]));
  const openWeighted = Object.fromEntries(Object.entries(openTotals.byCurrency).map(([c, v]) => [c, v.weighted]));

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          {(pipelines.data?.length ?? 0) > 1 && (
            <select className={cn(selectClass, "w-44")} aria-label={t("pipeline")} value={pipeline?.id ?? ""} onChange={(e) => set("pipeline", e.target.value)}>
              {pipelines.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input className="w-48 pl-8" placeholder={t("searchDeals")} aria-label={t("searchDeals")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={cn(selectClass, "w-40")} aria-label={t("owner")} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">{t("allOwners")}</option>
            <option value={meId}>{t("mine")}</option>
            {members.data?.filter((m) => m.id !== meId).map((m) => (
              <option key={m.id} value={m.id}>
                {memberName(members.data, m.id)}
              </option>
            ))}
          </select>
          <div className="ml-2 hidden text-sm text-muted-foreground lg:block" data-testid="pipeline-totals">
            {t("open")}: {openTotals.count} · {moneyLines(openAmount, locale) || "—"} · {t("weighted")}: {moneyLines(openWeighted, locale) || "—"}
          </div>
          <div className="ml-auto flex gap-1 rounded-lg border border-border bg-card p-1 text-sm" role="group" aria-label={t("view")}>
            <button aria-pressed={view === "board"} onClick={() => setView("board")} className={cn("flex items-center gap-1 rounded-md px-2 py-1", view === "board" ? "bg-muted font-medium" : "text-muted-foreground")}>
              <LayoutGrid className="size-4" />
              {t("viewBoard")}
            </button>
            <button aria-pressed={view === "map"} onClick={() => setView("map")} className={cn("flex items-center gap-1 rounded-md px-2 py-1", view === "map" ? "bg-muted font-medium" : "text-muted-foreground")}>
              <Network className="size-4" />
              {t("viewMap")}
            </button>
          </div>
          {view === "map" && (
            <Button variant="outline" size="sm" aria-pressed={heat} onClick={() => setHeat((v) => !v)} className={cn(heat && "text-[var(--health-red)]")}>
              <Flame className="size-4" />
              {t("stagnation")}
            </Button>
          )}
          {canWrite && (
            <Button onClick={() => setNewDeal(true)}>
              <Plus className="size-4" />
              {t("newDeal")}
            </Button>
          )}
        </div>

        {notice && (
          <div role="alert" className="mx-4 mt-2 flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
            {notice}
            <button className="ml-auto text-muted-foreground" onClick={() => setNotice(null)} aria-label={t("close")}>
              ×
            </button>
          </div>
        )}

        {view === "map" ? (
          <div className="min-h-0 flex-1" data-testid="pipeline-map">
            <TreeMap nodes={mapNodes} heatmap={heat} onOpen={(n) => n.kind === "deal" && set("deal", n.id)} />
          </div>
        ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4" data-testid="board">
            {board.isLoading && <SkeletonBoard />}
            {cols.map((c) => (
              <Column key={c.id} col={c} owners={ownerOf} selectedId={dealId} onOpen={(id) => set("deal", id)} locale={locale} />
            ))}
          </div>
          <DragOverlay>{dragging ? <Card deal={dragging} owner={ownerOf(dragging.ownerId)} selected={false} onOpen={() => undefined} overlay /> : null}</DragOverlay>
        </DndContext>
        )}
      </div>

      {dealId && (
        <DealDrawer
          key={dealId}
          workspaceId={workspaceId}
          slug={slug}
          dealId={dealId}
          canWrite={canWrite}
          meId={meId}
          onClose={() => set("deal", null)}
          onWin={(d) => {
            move.mutate({ dealId: d.id, stageId: cols.find((c) => c.isWon)?.id ?? "" }, { onSuccess: () => setWin(d) });
          }}
          onLose={(id) => setLose({ dealId: id })}
          onCreateProject={(d) => setWin(d)}
        />
      )}

      <NewDealDialog open={newDeal} onClose={() => setNewDeal(false)} workspaceId={workspaceId} pipeline={pipeline} onCreated={(id) => set("deal", id)} />
      <LoseDialog
        open={lose !== null}
        onClose={() => setLose(null)}
        workspaceId={workspaceId}
        onConfirm={async (reasonId) => {
          if (!lose) return;
          const stageId = lose.stageId ?? cols.find((c) => c.isLost)?.id ?? "";
          await api.post(`/api/v1/deals/${lose.dealId}/move`, { stageId, lostReasonId: reasonId, beforeId: lose.beforeId, afterId: lose.afterId });
          await qc.invalidateQueries({ queryKey: ["board"] });
          await qc.invalidateQueries({ queryKey: ["deal", lose.dealId] });
        }}
      />
      <WinProjectDialog open={win !== null} onClose={() => setWin(null)} workspaceId={workspaceId} slug={slug} deal={win} />
    </div>
  );
}
