"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { NodeDrawer } from "@/features/drawer/NodeDrawer";
import { EMPTY_FILTER } from "@/modules/nodes/filters";
import { resetHistoryFor } from "./actions";
import { KanbanView } from "@/features/views/KanbanView";
import { ListView } from "@/features/views/ListView";
import { ProjectCalendar } from "@/features/views/ProjectCalendar";
import { TimelineView } from "@/features/views/TimelineView";
import { AiAssistant } from "@/features/ai/ai";
import { PresenceBar } from "@/features/realtime/PresenceBar";
import { ProjectCreateBar } from "@/features/views/ProjectCreateBar";
import { useProjectLive } from "@/features/realtime/useProjectLive";
import { useView, ViewSwitcher } from "@/features/views/ViewSwitcher";
import { MindMapCanvas } from "./MindMapCanvas";
import { useMapStore } from "./store";
import type { TreePayload } from "./types";

/** Lives inside the query provider so the live hook can invalidate queries. */
function LiveBridge({ projectId }: { projectId: string }) {
  useProjectLive(projectId);
  return null;
}

export function MindMapView({ payload, backHref }: { payload: TreePayload; backHref: string }) {
  const t = useTranslations("map");
  const locale = useLocale();
  const { view } = useView();
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } } }));
  const [ready, setReady] = useState(false);
  const notice = useMapStore((s) => s.notice);
  const title = useMapStore((s) => s.nodes[payload.project.id]?.title ?? payload.project.title);

  useEffect(() => {
    const s = useMapStore.getState();
    if (s.projectId !== payload.project.id) {
      useMapStore.setState({ heatmap: false, filter: EMPTY_FILTER, focusId: null, editingId: null, notice: null, dropHint: null });
    }
    resetHistoryFor(payload.project.id);
    s.setTree(payload);
    setReady(true);
    // payload identity changes on every server render; only re-seed when the project changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.project.id]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => useMapStore.getState().setNotice(null), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  return (
    <QueryClientProvider client={client}>
      {ready && <LiveBridge projectId={payload.project.id} />}
      <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col">
        <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2">
          <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            {t("allProjects")}
          </Link>
          <h1 className="truncate text-base font-semibold">{title}</h1>
          <div className="ml-auto flex min-w-0 max-w-full items-center gap-3">
            {payload.role !== "CLIENT" && <ProjectCreateBar slug={backHref.split("/")[2] ?? ""} />}
            <PresenceBar />
            {payload.role !== "CLIENT" && payload.role !== "GUEST" && <AiAssistant projectId={payload.project.id} workspaceId={payload.project.workspaceId} />}
            <ViewSwitcher />
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto">
            {ready && view === "map" && <MindMapCanvas rootId={payload.project.id} />}
            {ready && view === "kanban" && <KanbanView locale={locale} />}
            {ready && view === "list" && <ListView />}
            {ready && view === "calendar" && <ProjectCalendar />}
            {ready && view === "timeline" && <TimelineView />}
          </div>
          {ready && <NodeDrawer rootId={payload.project.id} />}
        </div>
      </div>
    </QueryClientProvider>
  );
}
