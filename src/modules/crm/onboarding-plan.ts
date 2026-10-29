import type { TemplateNode } from "@/modules/nodes/templates";

export type PlanLocale = "ru" | "en" | "pl" | "uk";

/** One step of the first 30 days: when it starts, how long it takes, and whether the mentor checks it. */
export interface OnboardingStep {
  title: string;
  /** Days after the start. */
  day: number;
  days: number;
  /** The mentor gets a task of their own to check this step with the newcomer. */
  checkpoint: boolean;
}

export const MAX_STEPS = 30;
export const PLAN_DAYS = 30;

const T: Record<PlanLocale, [string, number, number, boolean][]> = {
  ru: [
    ["Знакомство с продуктом", 0, 3, false],
    ["Регистрация и заполнение профиля", 0, 2, false],
    ["Тёплый список: не меньше 50 имён", 1, 5, true],
    ["Первые 10 касаний по скриптам", 5, 5, false],
    ["Первая презентация вместе с наставником", 10, 5, true],
    ["Первое приглашение в команду", 15, 7, false],
    ["Разбор недели 1 с наставником", 7, 1, true],
    ["Разбор недели 2 с наставником", 14, 1, true],
    ["Разбор недели 3 с наставником", 21, 1, true],
    ["Разбор недели 4 с наставником", 28, 1, true],
  ],
  en: [
    ["Get to know the product", 0, 3, false],
    ["Register and fill in the profile", 0, 2, false],
    ["Warm list: at least 50 names", 1, 5, true],
    ["First 10 touches by the scripts", 5, 5, false],
    ["First presentation together with the mentor", 10, 5, true],
    ["First invitation to the team", 15, 7, false],
    ["Review of week 1 with the mentor", 7, 1, true],
    ["Review of week 2 with the mentor", 14, 1, true],
    ["Review of week 3 with the mentor", 21, 1, true],
    ["Review of week 4 with the mentor", 28, 1, true],
  ],
  pl: [
    ["Poznanie produktu", 0, 3, false],
    ["Rejestracja i uzupełnienie profilu", 0, 2, false],
    ["Ciepła lista: co najmniej 50 imion", 1, 5, true],
    ["Pierwsze 10 kontaktów według skryptów", 5, 5, false],
    ["Pierwsza prezentacja razem z mentorem", 10, 5, true],
    ["Pierwsze zaproszenie do zespołu", 15, 7, false],
    ["Omówienie tygodnia 1 z mentorem", 7, 1, true],
    ["Omówienie tygodnia 2 z mentorem", 14, 1, true],
    ["Omówienie tygodnia 3 z mentorem", 21, 1, true],
    ["Omówienie tygodnia 4 z mentorem", 28, 1, true],
  ],
  uk: [
    ["Знайомство з продуктом", 0, 3, false],
    ["Реєстрація та заповнення профілю", 0, 2, false],
    ["Теплий список: не менше 50 імен", 1, 5, true],
    ["Перші 10 дотиків за скриптами", 5, 5, false],
    ["Перша презентація разом з наставником", 10, 5, true],
    ["Перше запрошення до команди", 15, 7, false],
    ["Розбір тижня 1 з наставником", 7, 1, true],
    ["Розбір тижня 2 з наставником", 14, 1, true],
    ["Розбір тижня 3 з наставником", 21, 1, true],
    ["Розбір тижня 4 з наставником", 28, 1, true],
  ],
};

const CHECK: Record<PlanLocale, string> = { ru: "Проверить с новичком", en: "Check with the newcomer", pl: "Sprawdź z nowicjuszem", uk: "Перевірити з новачком" };
export const PLAN_TITLE: Record<PlanLocale, string> = { ru: "Первые 30 дней", en: "First 30 days", pl: "Pierwsze 30 dni", uk: "Перші 30 днів" };

/** The plan a workspace starts with, in the language of the person who opens it. */
export function defaultSteps(locale: PlanLocale): OnboardingStep[] {
  return T[locale].map(([title, day, days, checkpoint]) => ({ title, day, days, checkpoint }));
}

/** Steps as stored: trimmed titles, days inside the 30, at most 30 steps; nothing usable gives null (the default plan applies). */
export function cleanSteps(raw: unknown): OnboardingStep[] | null {
  if (!Array.isArray(raw)) return null;
  const out: OnboardingStep[] = [];
  for (const r of raw.slice(0, MAX_STEPS)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim().slice(0, 120) : "";
    if (!title) continue;
    const num = (v: unknown, fb: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fb);
    const day = num(o.day, 0, 0, PLAN_DAYS - 1);
    out.push({ title, day, days: num(o.days, 1, 1, PLAN_DAYS - day), checkpoint: o.checkpoint === true });
  }
  return out.length ? out : null;
}

export interface PlannedTask {
  title: string;
  /** Who does it: the newcomer, or the mentor (a check of a step). */
  who: "newcomer" | "mentor";
}

/** The project tree for the steps, and who each task belongs to in the same order (the newcomer's step, then the mentor's check of it). */
export function planToTemplate(steps: readonly OnboardingStep[], locale: PlanLocale): { root: TemplateNode; tasks: PlannedTask[] } {
  const children: TemplateNode[] = [];
  const tasks: PlannedTask[] = [];
  for (const s of [...steps].sort((a, b) => a.day - b.day)) {
    children.push({ type: "TASK", title: s.title, offsetDays: s.day, durationDays: s.days });
    tasks.push({ title: s.title, who: "newcomer" });
    if (s.checkpoint) {
      const title = `${CHECK[locale]}: ${s.title}`;
      children.push({ type: "TASK", title, offsetDays: s.day + s.days - 1, durationDays: 1 });
      tasks.push({ title, who: "mentor" });
    }
  }
  return { root: { type: "PROJECT", title: "", children }, tasks };
}

export interface OnboardingProgress {
  projectId: string;
  done: number;
  total: number;
  percent: number;
  /** The first step of the newcomer that is not done yet. */
  next: string | null;
  startedAt: string;
  /** All the newcomer's steps are done. */
  finished: boolean;
}

export function progressOf(projectId: string, startedAt: Date, tasks: readonly { title: string; status: string; position: number }[]): OnboardingProgress {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const next = [...tasks].sort((a, b) => a.position - b.position).find((t) => t.status !== "DONE" && t.status !== "CANCELLED")?.title ?? null;
  return { projectId, done, total, percent: total ? Math.round((done / total) * 100) : 0, next, startedAt: startedAt.toISOString(), finished: total > 0 && done === total };
}
