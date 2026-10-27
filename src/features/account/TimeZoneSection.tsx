"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/ui/modal";
import { ApiFailure, api } from "@/features/mindmap/api";
import { useTimeZone } from "@/features/views/useTimeZone";
import { browserTimeZone, listTimeZones, offsetLabel } from "@/modules/views/tz";

/** Groups of zones by region ("Europe", "America", …), each as "City (UTC+01:00)", so the list is searchable by typing the city. */
function groups(now: Date): { region: string; zones: { id: string; label: string }[] }[] {
  const byRegion = new Map<string, { id: string; label: string }[]>();
  for (const id of listTimeZones()) {
    const slash = id.indexOf("/");
    const region = slash < 0 ? "UTC" : id.slice(0, slash);
    const city = (slash < 0 ? id : id.slice(slash + 1)).replace(/_/g, " ");
    byRegion.set(region, [...(byRegion.get(region) ?? []), { id, label: `${city} (${offsetLabel(id, now)})` }]);
  }
  return [...byRegion.entries()].map(([region, zones]) => ({ region, zones }));
}

/** Each person's own time zone: the workspace calendar and the new-meeting form show and take hours in it. Everything stored stays UTC. */
export function TimeZoneSection() {
  const t = useTranslations("account");
  const locale = useLocale();
  const qc = useQueryClient();
  const { tz, loaded } = useTimeZone();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Only after mounting: the list and its offsets come from the browser, so the server cannot draw the same markup.
  const options = useMemo(() => (mounted ? groups(new Date()) : []), [mounted]);
  const browser = mounted ? browserTimeZone() : "UTC";

  const save = useMutation({
    mutationFn: (timezone: string) => api.patch("/api/v1/me", { timezone }),
    onSuccess: async () => {
      setError(null);
      setSaved(true);
      await Promise.all([qc.invalidateQueries({ queryKey: ["me"] }), qc.invalidateQueries({ queryKey: ["calendar"] })]);
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("error")),
  });

  const clock = mounted ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(now) : "";

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4" data-testid="timezone-section">
      <h2 className="font-semibold">{t("tzTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("tzHint")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-64 flex-col gap-1 text-xs text-muted-foreground">
          {t("tzLabel")}
          <select
            className={selectClass}
            aria-label={t("tzLabel")}
            value={tz}
            disabled={!loaded || !mounted || save.isPending}
            onChange={(e) => {
              setSaved(false);
              save.mutate(e.target.value);
            }}
          >
            {!mounted && <option value={tz}>{tz}</option>}
            {options.map((g) =>
              g.region === "UTC" ? (
                g.zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    UTC
                  </option>
                ))
              ) : (
                <optgroup key={g.region} label={g.region}>
                  {g.zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.label}
                    </option>
                  ))}
                </optgroup>
              ),
            )}
          </select>
        </label>
        {mounted && browser !== tz && (
          <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate(browser)}>
            {t("tzUseBrowser", { zone: browser.replace(/_/g, " ") })}
          </Button>
        )}
      </div>
      {mounted && (
        <p className="text-sm" data-testid="tz-now">
          {t("tzNow", { time: clock, offset: offsetLabel(tz, now) })}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-[var(--health-green)]">
          {t("tzSaved")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
