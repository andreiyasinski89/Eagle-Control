"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/modal";
import { DECLINE_REASONS } from "@/modules/crm/decline";
import { BOARD_STAGES, INTERESTS, PRIORITIES, SIDE_STAGES, SOURCES, TEMPERATURES, type Priority, type Stage, type Temp } from "@/modules/crm/people";
import { cn } from "@/lib/utils";
import { useGroups } from "./useGroups";

const TEMP_ICON: Record<Temp, string> = { HOT: "🔥", WARM: "🟡", COLD: "❄️" };
export const PRIORITY_ICON: Record<Priority, string> = { TRAVEL: "✈️", BUSINESS: "💼" };

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
  groupId: string | null;
  declineReason: string | null;
}

const dayOf = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/**
 * Where the person is in the funnel and what comes next, in the card: pick the stage and the warmth with one press,
 * say what the next step is and when. Every change is saved at once.
 */
export function FunnelFields({ value, disabled, workspaceId, onChange }: { value: FunnelValues; disabled: boolean; workspaceId: string; onChange: (patch: Record<string, unknown>) => void }) {
  const t = useTranslations("crm");
  const groups = useGroups(workspaceId);

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

      {value.stage === "DECLINED" && (
        <FormField label={t("declineLabel")}>
          <select disabled={disabled} className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm" value={value.declineReason ?? ""} onChange={(e) => onChange({ declineReason: e.target.value || null })} data-testid="decline-reason-select">
            <option value="">{t("declineNone")}</option>
            {DECLINE_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`declineReason.${r}`)}
              </option>
            ))}
          </select>
        </FormField>
      )}

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
      </div>

      <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("field.typeTag")}</span>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t("field.typeTag")} data-testid="priority-field">
            {PRIORITIES.map((x) => (
              <button key={x} type="button" role="radio" aria-checked={value.typeTag === x} disabled={disabled} data-priority={x} onClick={() => onChange({ typeTag: value.typeTag === x ? null : x })} className={cn("rounded-full border px-2.5 py-1 text-xs", value.typeTag === x ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground hover:bg-muted")}>
                {PRIORITY_ICON[x]} {t(`priority.${x}`)}
              </button>
            ))}
            {value.typeTag && !(PRIORITIES as readonly string[]).includes(value.typeTag) && <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">{value.typeTag}</span>}
          </div>
      </div>

      <FormField label={t("groupField")}>
        <select disabled={disabled} className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm" value={value.groupId ?? ""} onChange={(e) => onChange({ groupId: e.target.value || null })} data-testid="contact-group">
          <option value="">{t("noGroup")}</option>
          {groups.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </FormField>

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
