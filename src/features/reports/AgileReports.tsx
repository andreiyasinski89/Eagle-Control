"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api, ApiFailure } from "@/features/mindmap/api";
import { GroupedBars, HBars, LineChart, SERIES, StackedArea } from "./Charts";
import { Card, Stat } from "./ui";

interface Metrics {
  velocity: { sprints: { sprintId: string; title: string; committed: number; completed: number; finished: boolean }[]; average: number | null };
  burndowns: { sprintId: string; title: string; points: { date: string; ideal: number; actual: number | null }[] }[];
  flow: { date: string; BACKLOG: number; TODO: number; IN_PROGRESS: number; IN_REVIEW: number; DONE: number }[];
  cycle: { count: number; average: number | null; p50: number | null; p85: number | null; p95: number | null; histogram: { from: number; to: number | null; count: number }[] };
  throughput: { week: string; done: number; weight: number }[];
  taskCount: number;
}

const short = (d: string) => d.slice(5).replace("-", "/");

/** Velocity, burndown, cumulative flow, cycle time and throughput of one project. */
export function AgileReports({ projects }: { projects: { id: string; title: string }[] }) {
  const t = useTranslations("reports");
  const tm = useTranslations("map");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [sprintId, setSprintId] = useState<string | null>(null);
  const { data, error, isLoading } = useQuery({ queryKey: ["agile-metrics", projectId], enabled: !!projectId, queryFn: () => api.get<Metrics>(`/api/v1/projects/${projectId}/metrics`) });

  if (projects.length === 0) return <p className="text-sm text-muted-foreground">{t("noProjects")}</p>;
  const burn = data?.burndowns.find((b) => b.sprintId === sprintId) ?? data?.burndowns.find((b) => b.points.some((p) => p.actual === null)) ?? data?.burndowns[data.burndowns.length - 1];

  return (
    <div className="flex flex-col gap-4" data-testid="agile-reports">
      <label className="flex w-fit items-center gap-2 text-sm">
        {t("project")}
        <select className="h-9 rounded-md border border-border bg-card px-2" value={projectId} onChange={(e) => { setProjectId(e.target.value); setSprintId(null); }}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      {error instanceof ApiFailure && (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">…</p>}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label={t("avgVelocity")} value={data.velocity.average === null ? "—" : String(data.velocity.average)} hint={t("avgVelocityHint")} />
            <Stat label={t("cycleMedian")} value={data.cycle.p50 === null ? "—" : t("days", { n: data.cycle.p50 })} hint={t("cycleSample", { n: data.cycle.count })} />
            <Stat label={t("cycleP85")} value={data.cycle.p85 === null ? "—" : t("days", { n: data.cycle.p85 })} hint={t("cycleP95", { n: data.cycle.p95 ?? "—" })} />
            <Stat label={t("thisWeek")} value={String(data.throughput[data.throughput.length - 1]?.done ?? 0)} hint={t("tasksDone")} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={t("velocity")} hint={t("velocityHint")}>
              {data.velocity.sprints.length === 0 ? (
                <Empty />
              ) : (
                <GroupedBars label={t("velocity")} labels={data.velocity.sprints.map((s) => s.title)} series={[{ name: t("committed"), color: SERIES[1], values: data.velocity.sprints.map((s) => s.committed) }, { name: t("completed"), color: SERIES[0], values: data.velocity.sprints.map((s) => s.completed) }]} />
              )}
            </Card>
            <Card
              title={t("burndown")}
              hint={t("burndownHint")}
              action={
                data.burndowns.length > 1 && (
                  <select aria-label={t("sprint")} className="h-8 rounded-md border border-border bg-card px-2 text-sm" value={burn?.sprintId ?? ""} onChange={(e) => setSprintId(e.target.value)}>
                    {data.burndowns.map((b) => (
                      <option key={b.sprintId} value={b.sprintId}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                )
              }
            >
              {burn ? <LineChart label={t("burndown")} labels={burn.points.map((p) => short(p.date))} series={[{ name: t("ideal"), color: SERIES[1], values: burn.points.map((p) => p.ideal), dashed: true }, { name: t("remaining"), color: SERIES[0], values: burn.points.map((p) => p.actual) }]} /> : <Empty />}
            </Card>
            <Card title={t("flow")} hint={t("flowHint")}>
              <StackedArea
                label={t("flow")}
                labels={data.flow.map((p) => short(p.date))}
                series={(["DONE", "IN_REVIEW", "IN_PROGRESS", "TODO", "BACKLOG"] as const).map((s, i) => ({ name: tm(`status.${s}`), color: [SERIES[4], SERIES[3], SERIES[0], SERIES[1], "#94a3b8"][i] as string, values: data.flow.map((p) => p[s]) }))}
              />
            </Card>
            <Card title={t("throughput")} hint={t("throughputHint")}>
              <GroupedBars label={t("throughput")} labels={data.throughput.map((w) => short(w.week))} series={[{ name: t("tasksDone"), color: SERIES[0], values: data.throughput.map((w) => w.done) }]} />
            </Card>
            <Card title={t("cycleTime")} hint={t("cycleHint")}>
              {data.cycle.count === 0 ? (
                <Empty />
              ) : (
                <HBars rows={data.cycle.histogram.map((h) => ({ label: h.to === null ? t("daysOver", { n: h.from }) : t("daysRange", { from: h.from, to: h.to }), value: h.count }))} />
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Empty() {
  const t = useTranslations("reports");
  return <p className="py-8 text-center text-sm text-muted-foreground">{t("noData")}</p>;
}
