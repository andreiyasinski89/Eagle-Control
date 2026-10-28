"use client";

import { useTranslations } from "next-intl";
import { FormField, selectClass } from "@/components/ui/modal";
import { PRESETS, type Preset } from "@/modules/nodes/repeat";

const inputClass = "h-9 w-full rounded-md border border-border bg-card px-2 text-sm";
const LABEL: Record<Preset, string> = { NONE: "repeatNone", DAILY: "repeatDaily", WEEKLY: "repeatWeekly", BIWEEKLY: "repeatBiweekly", MONTHLY: "repeatMonthly" };

/** "Repeat" and "Repeat until": the two fields that make a meeting a series. `CUSTOM` is a rule made elsewhere; it is shown, and kept unless the person picks another. */
export function RepeatFields({ preset, until, minDay, disabled, onPreset, onUntil }: { preset: Preset | "CUSTOM"; until: string; minDay?: string; disabled?: boolean; onPreset: (p: Preset) => void; onUntil: (day: string) => void }) {
  const t = useTranslations("views");
  const repeating = preset !== "NONE";
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="repeat-fields">
      <FormField label={t("repeat")}>
        <select className={selectClass} value={preset} disabled={disabled} onChange={(e) => onPreset(e.target.value as Preset)} data-testid="repeat-select">
          {PRESETS.map((p) => (
            <option key={p} value={p}>
              {t(LABEL[p])}
            </option>
          ))}
          {preset === "CUSTOM" && <option value="CUSTOM">{t("repeatCustom")}</option>}
        </select>
      </FormField>
      {repeating && (
        <FormField label={t("repeatUntil")} hint={t("repeatUntilHint")}>
          <input type="date" className={inputClass} value={until} min={minDay} disabled={disabled} onChange={(e) => onUntil(e.target.value)} data-testid="repeat-until" />
        </FormField>
      )}
    </div>
  );
}
