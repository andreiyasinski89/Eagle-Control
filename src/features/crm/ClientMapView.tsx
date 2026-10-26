"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/features/mindmap/api";
import { cn } from "@/lib/utils";
import { money, moneyLines } from "./format";
import { TreeMap, type TreeKind, type TreeMapNode } from "./TreeMap";

interface MapNodeDto {
  id: string;
  parentId: string | null;
  type: string;
  title: string;
  status: string;
  progress: number;
  health: "GREEN" | "YELLOW" | "RED";
  healthOverride: "GREEN" | "YELLOW" | "RED" | null;
  position: number;
  linked?: boolean;
  crm?: { kind: "company" | "contact" | "deal"; lifecycleStage?: string; revenue?: Record<string, number>; atRisk?: boolean; position?: string | null; noTouch?: boolean; amount?: number; currency?: string; stage?: string; probability?: number; dealStatus?: string };
}
interface MapDto {
  nodes: MapNodeDto[];
  atRisk: boolean;
}

const KIND: Record<string, TreeKind> = { COMPANY: "company", CONTACT: "contact", DEAL: "deal", PROJECT: "project", EPIC: "epic", SPRINT: "sprint", TASK: "task", SUBTASK: "subtask", DOCUMENT: "doc", EVENT: "doc" };

/**
 * Company → contacts and deals → (linked) projects → epics → sprints → tasks.
 * Dashed edges are DEAL_PROJECT links: the project does not depend on the CRM tree.
 */
export function ClientMapView({ companyId, slug }: { companyId: string; workspaceId: string; slug: string; canWrite: boolean; meId: string }) {
  const t = useTranslations("crm");
  const tm = useTranslations("map");
  const locale = useLocale();
  const router = useRouter();
  const [heatmap, setHeatmap] = useState(true);
  const { data, isLoading, isError } = useQuery({ queryKey: ["company-map", companyId], queryFn: () => api.get<MapDto>(`/api/v1/companies/${companyId}/map`) });

  const { nodes, rootOf } = useMemo(() => {
    const dto = data?.nodes ?? [];
    const byId = new Map(dto.map((n) => [n.id, n]));
    const root = new Map<string, string>(); // project node → the project it belongs to
    for (const n of dto) {
      let cur: MapNodeDto | undefined = n;
      while (cur && !cur.linked && cur.parentId) cur = byId.get(cur.parentId);
      if (cur?.linked) root.set(n.id, cur.id);
    }
    const out: TreeMapNode[] = dto.map((n) => {
      const kind = KIND[n.type] ?? "task";
      const health = n.healthOverride ?? n.health;
      let subtitle: string | undefined;
      const c = n.crm;
      if (c?.kind === "company") subtitle = [t(`lifecycle.${c.lifecycleStage ?? "LEAD"}`), moneyLines(c.revenue ?? {}, locale)].filter(Boolean).join(" · ");
      if (c?.kind === "contact") subtitle = [c.position, c.noTouch ? t("noTouch30") : null].filter(Boolean).join(" · ");
      if (c?.kind === "deal") subtitle = `${money(c.amount ?? 0, c.currency ?? "EUR", locale)} · ${c.stage}`;
      if (!c && n.type !== "DOCUMENT" && n.type !== "EVENT") subtitle = `${n.progress}% · ${tm(`health.${health}`)}`;
      return {
        id: n.id,
        parentId: n.parentId,
        position: n.position,
        kind,
        title: n.title,
        subtitle,
        health: c?.kind === "contact" ? null : health,
        progress: c || n.type === "DOCUMENT" || n.type === "EVENT" ? null : n.progress,
        linked: n.linked,
        warning: c?.kind === "company" ? c.atRisk : undefined,
        closed: c?.kind === "deal" && c.dealStatus !== "open",
      };
    });
    return { nodes: out, rootOf: root };
  }, [data, locale, t, tm]);

  if (isError) return <p className="text-sm text-muted-foreground">{t("error")}</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" aria-pressed={heatmap} className={cn(heatmap && "bg-muted text-[var(--health-red)]")} onClick={() => setHeatmap((v) => !v)}>
          <Flame className="size-4" />
          {tm("heatmap")}
        </Button>
        <span className="text-xs text-muted-foreground">{t("clientMapHint")}</span>
      </div>
      <div className="h-[68vh] min-h-96 overflow-hidden rounded-lg border border-border bg-card" data-testid="client-map">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">…</p>
        ) : (
          <TreeMap
            nodes={nodes}
            heatmap={heatmap}
            onOpen={(n) => {
              if (n.kind === "contact") router.push(`/w/${slug}/crm/contacts?contact=${n.id}`);
              else if (n.kind === "deal") router.push(`/w/${slug}/crm?deal=${n.id}`);
              else if (n.kind !== "company") {
                const project = rootOf.get(n.id);
                if (project) router.push(`/w/${slug}/projects/p/${project}${project === n.id ? "" : `?node=${n.id}`}`);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
