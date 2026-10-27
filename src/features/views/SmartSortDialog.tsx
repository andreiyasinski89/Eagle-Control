"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, selectClass } from "@/components/ui/modal";
import { rescheduleNodes } from "@/features/mindmap/actions";
import { useMapStore } from "@/features/mindmap/store";
import { formatMinutes, planSchedule, type BlockLink, type SortItem, type Unit } from "@/modules/views/smart-sort";
import type { WorkItem } from "@/modules/views/views";
import { usePersonName } from "./useWorkItems";

type Item = WorkItem & { position: number };

const dayLabel = (d: string | null, locale: string) => (d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" }) : "—");

/**
 * Smart sort: lays the open tasks one after another, each person's in their own queue, by their estimates (a story point is 10 minutes),
 * and shows the result before anything is changed. The person chooses whose tasks, the first day and the length of a working day.
 */
export function SmartSortDialog({ open, onClose, items, links, today, locale, onDone }: { open: boolean; onClose: () => void; items: Item[]; links: BlockLink[]; today: string; locale: string; onDone: (n: number) => void }) {
  const t = useTranslations("views");
  const meId = useMapStore((s) => s.meId);
  const projectId = useMapStore((s) => s.projectId);
  const projectUnit = useMapStore((s) => (s.projectId ? s.nodes[s.projectId]?.estimationUnit : null)) ?? "HOURS";
  const name = usePersonName();
  const [scope, setScope] = useState<"mine" | "all" | null>(null);
  const [startDate, setStartDate] = useState(today);
  const [hours, setHours] = useState(8);
  const [busy, setBusy] = useState(false);

  // Only tasks that have no subtasks are placed; a task with subtasks is made of them.
  const parents = useMemo(() => new Set(items.map((i) => i.parentId).filter((x): x is string => !!x)), [items]);
  const leaves = useMemo(() => items.filter((i) => !parents.has(i.id) && i.status !== "DONE" && i.status !== "CANCELLED"), [items, parents]);
  const mine = useMemo(() => leaves.filter((i) => i.assigneeId === meId), [leaves, meId]);
  const chosen = scope ?? (mine.length > 0 ? "mine" : "all");
  const inScope = useMemo(() => leaves.filter((i) => chosen === "all" || i.assigneeId === meId), [leaves, chosen, meId]);

  const dayMinutes = Math.max(30, Math.min(24, hours || 8) * 60);
  const plan = useMemo(() => {
    const sortItems: SortItem[] = inScope.map((i) => ({ id: i.id, title: i.title, assigneeId: i.assigneeId, status: i.status, startDate: i.startDate, dueDate: i.dueDate, estimation: i.estimation, estimationUnit: (i.estimationUnit ?? null) as Unit | null, position: i.position }));
    const scoped = new Set(inScope.map((i) => i.id));
    const others = items.filter((i) => !scoped.has(i.id)).map((i) => ({ id: i.id, status: i.status, dueDate: i.dueDate }));
    return planSchedule(sortItems, links, { startDate: startDate || today, dayMinutes, defaultUnit: projectUnit as Unit }, others);
  }, [inScope, items, links, startDate, today, dayMinutes, projectUnit]);
  const title = useMemo(() => new Map(items.map((i) => [i.id, i.title])), [items]);
  const noEstimate = plan.filter((m) => !m.estimated).length;
  const late = plan.filter((m) => m.late).length;
  const changed = plan.filter((m) => m.from.start?.slice(0, 10) !== m.to.start || m.from.due?.slice(0, 10) !== m.to.due);

  const size = (minutes: number) => {
    const { d, h, m } = formatMinutes(minutes, dayMinutes);
    return [d ? t("sortDays", { n: d }) : "", h ? t("sortHours", { n: h }) : "", m ? t("sortMinutes", { n: m }) : ""].filter(Boolean).join(" ");
  };

  async function apply() {
    if (!projectId) return;
    setBusy(true);
    const ok = await rescheduleNodes(changed.map((m) => ({ id: m.id, start: m.to.start, due: m.to.due })));
    setBusy(false);
    if (ok) {
      onDone(changed.length);
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("sortTitle")} wide>
      <div className="flex flex-col gap-4 text-sm" data-testid="smart-sort">
        <p className="text-muted-foreground">{t("sortIntro")}</p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-medium">{t("sortWhose")}</span>
            <select className={`${selectClass} w-56`} value={chosen} onChange={(e) => setScope(e.target.value as "mine" | "all")} data-testid="sort-scope">
              <option value="mine">{t("sortMine", { n: mine.length })}</option>
              <option value="all">{t("sortAll", { n: leaves.length })}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">{t("sortStart")}</span>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" data-testid="sort-start" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">{t("sortDayHours")}</span>
            <Input type="number" min={1} max={24} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-24" data-testid="sort-hours" />
          </label>
        </div>

        {plan.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground">{t("sortNothing")}</p>
        ) : (
          <>
            <div className="max-h-80 overflow-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs" data-testid="sort-preview">
                <thead className="sticky top-0 bg-card text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t("sortTask")}</th>
                    <th className="px-3 py-2 font-medium">{t("sortWho")}</th>
                    <th className="px-3 py-2 font-medium">{t("sortSize")}</th>
                    <th className="px-3 py-2 font-medium">{t("sortBefore")}</th>
                    <th className="px-3 py-2 font-medium">{t("sortAfter")}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((m) => (
                    <tr key={m.id} className="border-t border-border" data-testid="sort-row">
                      <td className="max-w-56 truncate px-3 py-1.5 text-sm" title={title.get(m.id)}>
                        {title.get(m.id)}
                      </td>
                      <td className="px-3 py-1.5">{name(m.assigneeId) || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        {size(m.minutes)}
                        {!m.estimated && <span className="ml-1 text-[var(--health-yellow)]">{t("sortNoEstimate")}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                        {dayLabel(m.from.start, locale)} – {dayLabel(m.from.due, locale)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 font-medium">
                        {dayLabel(m.to.start, locale)} – {dayLabel(m.to.due, locale)}
                        {m.late && <span className="ml-1 text-[var(--health-red)]">{t("sortLate")}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("sortSummary", { n: plan.length, changed: changed.length })}
              {noEstimate > 0 && ` ${t("sortNoEstimateNote", { n: noEstimate, hours })}`}
              {late > 0 && ` ${t("sortLateNote", { n: late })}`}
            </p>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("sortCancel")}
          </Button>
          <Button type="button" disabled={busy || changed.length === 0} onClick={() => void apply()} data-testid="sort-apply">
            {t("sortApply", { n: changed.length })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
