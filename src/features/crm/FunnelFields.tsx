"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/modal";
import { BOARD_STAGES, INTERESTS, SIDE_STAGES, SOURCES, TEMPERATURES, type Stage, type Temp } from "@/modules/crm/people";
import { cn } from "@/lib/utils";

const TEMP_ICON: Record<Temp, string> = { HOT: "🔥", WARM: "🟡", COLD: "❄️" };

export interface FunnelValues {
  stage: Stage;
  temperature: Temp | null;
  interests: string[];
  source: string | null;
  influence: number | null;
  nextStep: string | null;
  nextStepAt: string | null;
  typeTag: string | null;
  country: string | null;
  sponsorName: string | null;
}

const dayOf = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/**
 * Where the person is in the funnel and what comes next, in the card: pick the stage and the warmth with one press,
 * say what the next step is and when. Every change is saved at once.
 */
export function FunnelFields({ value, disabled, onChange }: { value: FunnelValues; disabled: boolean; onChange: (patch: Record<string, unknown>) => void }) {
  const t = useTranslations("crm");
  const [influence, setInfluence] = useState(value.influence === null ? "" : String(value.influence));
  useEffect(() => setInfluence(value.influence === null ? "" : String(value.influence)), [value.influence]);

  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="funnel-fields">
      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">{t("field.stage")}</div>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t("field.stage")}>
          {[...BOARD_STAGES, ...SIDE_STAGES].map((s) => (
            <button key={s} type="button" role="radio" aria-checked={value.stage === s} disabled={disabled} data-stage={s} onClick={() => value.stage !== s && onChange({ stage: s })} className={cn("rounded-full border px-2.5 py-1 text-xs", value.stage === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted", disabled && "opacity-60")}>
              {t(`funnelStage.${s}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">{t("field.temperature")}</div>
        <div className="flex gap-1" role="radiogroup" aria-label={t("field.temperature")}>
          {TEMPERATURES.map((x) => (
            <button key={x} type="button" role="radio" aria-checked={value.temperature === x} disabled={disabled} onClick={() => onChange({ temperature: value.temperature === x ? null : x })} className={cn("rounded-full border px-2.5 py-1 text-xs", value.temperature === x ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground hover:bg-muted")}>
              {TEMP_ICON[x]} {t(`temp.${x}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_9rem] gap-3">
        <FormField label={t("field.nextStep")}>
          <Input disabled={disabled} defaultValue={value.nextStep ?? ""} key={`ns${value.nextStep}`} maxLength={200} placeholder={t("nextStepPlaceholder")} onBlur={(e) => e.target.value !== (value.nextStep ?? "") && onChange({ nextStep: e.target.value.trim() || null })} />
        </FormField>
        <FormField label={t("field.nextStepAt")}>
          <Input type="date" disabled={disabled} value={dayOf(value.nextStepAt)} onChange={(e) => onChange({ nextStepAt: e.target.value ? `${e.target.value}T00:00:00.000Z` : null })} />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label={t("field.source")}>
          <select disabled={disabled} className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm" value={value.source ?? ""} onChange={(e) => onChange({ source: e.target.value || null })}>
            <option value="">—</option>
            {value.source && !(SOURCES as readonly string[]).includes(value.source) && <option value={value.source}>{value.source}</option>}
            {SOURCES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t("field.country")}>
          <Input disabled={disabled} defaultValue={value.country ?? ""} key={`c${value.country}`} maxLength={80} onBlur={(e) => e.target.value !== (value.country ?? "") && onChange({ country: e.target.value.trim() || null })} />
        </FormField>
        <FormField label={t("field.influence")}>
          <Input type="number" min={0} max={100} disabled={disabled} value={influence} onChange={(e) => setInfluence(e.target.value)} onBlur={() => (influence === "" ? value.influence !== null && onChange({ influence: null }) : Number(influence) !== value.influence && onChange({ influence: Math.max(0, Math.min(100, Math.round(Number(influence)))) }))} />
        </FormField>
        <FormField label={t("field.typeTag")}>
          <Input disabled={disabled} defaultValue={value.typeTag ?? ""} key={`t${value.typeTag}`} maxLength={10} onBlur={(e) => e.target.value !== (value.typeTag ?? "") && onChange({ typeTag: e.target.value.trim() || null })} />
        </FormField>
      </div>

      <FormField label={t("field.sponsorName")}>
        <Input disabled={disabled} defaultValue={value.sponsorName ?? ""} key={`s${value.sponsorName}`} maxLength={120} onBlur={(e) => e.target.value !== (value.sponsorName ?? "") && onChange({ sponsorName: e.target.value.trim() || null })} />
      </FormField>

      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">{t("field.interests")}</div>
        <div className="flex flex-wrap gap-1.5">
          {[...INTERESTS, ...value.interests.filter((i) => !(INTERESTS as readonly string[]).includes(i))].map((x) => (
            <button key={x} type="button" aria-pressed={value.interests.includes(x)} disabled={disabled} onClick={() => onChange({ interests: value.interests.includes(x) ? value.interests.filter((i) => i !== x) : [...value.interests, x] })} className={cn("rounded-full border px-2.5 py-1 text-xs", value.interests.includes(x) ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground hover:bg-muted")}>
              {x}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
