"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";
import { AGENT_LIMITS, DEFAULT_AGENT_SETTINGS, type AgentSettings } from "@/modules/crm/agent-settings";

/** What the person tells their sales agent: on or off, the briefing time, the day's norms, the goal and the daily limit of runs. */
export function AgentSettingsPanel({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("agentSettings");
  const qc = useQueryClient();
  const key = ["agent-settings", workspaceId];
  const { data, isError } = useQuery({ queryKey: key, queryFn: () => api.get<AgentSettings>(`/api/v1/workspaces/${workspaceId}/agent-settings`) });
  const [s, setS] = useState<AgentSettings>(DEFAULT_AGENT_SETTINGS);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (data) setS(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.put<AgentSettings>(`/api/v1/workspaces/${workspaceId}/agent-settings`, s),
    onSuccess: (saved) => {
      qc.setQueryData(key, saved);
      setNote(t("saved"));
    },
    onError: (e) => setNote(e instanceof ApiFailure ? e.message : t("failed")),
  });
  const set = <K extends keyof AgentSettings>(k: K, v: AgentSettings[K]) => (setNote(null), setS((x) => ({ ...x, [k]: v })));
  const num = (v: string, fallback: number) => (v === "" || Number.isNaN(Number(v)) ? fallback : Number(v));

  // Guests have no agent: the request is refused and the panel stays out of the way.
  if (isError || !data) return null;
  return (
    <section className="rounded-lg border border-border bg-card p-4" data-testid="agent-settings">
      <h2 className="text-base font-semibold">{t("title")}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{t("hint")}</p>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={s.enabled} onChange={(e) => set("enabled", e.target.checked)} data-testid="agent-enabled" />
        {t("enabled")}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("briefingTime")}>
          <Input type="time" value={s.briefingTime} onChange={(e) => set("briefingTime", e.target.value)} data-testid="agent-briefing-time" />
        </FormField>
        <FormField label={t("dailyRunLimit")}>
          <Input type="number" min={AGENT_LIMITS.dailyRunLimit[0]} max={AGENT_LIMITS.dailyRunLimit[1]} value={s.dailyRunLimit} onChange={(e) => set("dailyRunLimit", num(e.target.value, s.dailyRunLimit))} />
        </FormField>
        <FormField label={t("touchesPerDay")}>
          <Input type="number" min={AGENT_LIMITS.touchesPerDay[0]} max={AGENT_LIMITS.touchesPerDay[1]} value={s.touchesPerDay} onChange={(e) => set("touchesPerDay", num(e.target.value, s.touchesPerDay))} data-testid="agent-touches" />
        </FormField>
        <FormField label={t("meetingsPerDay")}>
          <Input type="number" min={AGENT_LIMITS.meetingsPerDay[0]} max={AGENT_LIMITS.meetingsPerDay[1]} value={s.meetingsPerDay} onChange={(e) => set("meetingsPerDay", num(e.target.value, s.meetingsPerDay))} data-testid="agent-meetings" />
        </FormField>
        <FormField label={t("goal")}>
          <Input value={s.goal} maxLength={AGENT_LIMITS.goal} placeholder={t("goalPlaceholder")} onChange={(e) => set("goal", e.target.value)} data-testid="agent-goal" />
        </FormField>
        <FormField label={t("deadline")}>
          <Input type="date" value={s.deadline ?? ""} onChange={(e) => set("deadline", e.target.value === "" ? null : e.target.value)} data-testid="agent-deadline" />
        </FormField>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("limitNote")}</p>
      <div className="mt-3 flex items-center justify-end gap-3">
        {note && (
          <span role="status" className="text-xs text-muted-foreground">
            {note}
          </span>
        )}
        <Button type="button" className="min-h-11" disabled={save.isPending} onClick={() => save.mutate()} data-testid="agent-settings-save">
          {t("save")}
        </Button>
      </div>
    </section>
  );
}
