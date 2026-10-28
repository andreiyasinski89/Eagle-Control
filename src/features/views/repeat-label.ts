import { presetOf, type Freq } from "@/modules/nodes/repeat";

type T = (key: string, values?: Record<string, string | number>) => string;
const KEY = { DAILY: "repeatDaily", WEEKLY: "repeatWeekly", BIWEEKLY: "repeatBiweekly", MONTHLY: "repeatMonthly" } as const;

/** "Every week", "Every 2 weeks", "Every 3 weeks": the rule in words; `t` is the translator of the "views" messages. */
export function repeatLabel(t: T, rule: { freq: Freq; interval: number }): string {
  const preset = presetOf({ ...rule, tz: "UTC", skip: [] });
  return preset === "CUSTOM" || preset === "NONE" ? t("repeatEvery", { freq: rule.freq, n: rule.interval }) : t(KEY[preset]);
}
