"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslations } from "next-intl";
import type { NodeDetail } from "./types";

const STATUS_COLOR: Record<string, string> = {
  BACKLOG: "#9ca3af",
  TODO: "#94a3b8",
  IN_PROGRESS: "#6366f1",
  IN_REVIEW: "#a855f7",
  DONE: "#16a34a",
};

export function SprintSummary({ detail }: { detail: NodeDetail }) {
  const t = useTranslations("map");
  const td = useTranslations("drawer");
  const entries = Object.entries(detail.statusSummary);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{td("tasksByStatus", { count: detail.taskCount })}</div>
        {detail.taskCount === 0 ? (
          <p className="text-sm text-muted-foreground">{td("noTasks")}</p>
        ) : (
          <>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={td("tasksByStatus", { count: detail.taskCount })}>
              {entries.map(([status, n]) => (
                <div key={status} style={{ width: `${((n ?? 0) / detail.taskCount) * 100}%`, background: STATUS_COLOR[status] ?? "#999" }} title={`${t(`status.${status}`)}: ${n}`} />
              ))}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {entries.map(([status, n]) => (
                <li key={status} className="flex items-center gap-1">
                  <span className="size-2 rounded-full" style={{ background: STATUS_COLOR[status] ?? "#999" }} />
                  {t(`status.${status}`)} · {n}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {detail.burndown && (
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{td("burndown")}</div>
          <div className="h-40" data-testid="burndown">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={detail.burndown} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="linear" dataKey="ideal" name={td("ideal")} stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} />
                <Line type="stepAfter" dataKey="actual" name={td("actual")} stroke="var(--primary)" strokeWidth={2} dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
