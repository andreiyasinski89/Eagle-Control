/** What one person tells their sales agent: whether it runs, when the morning briefing comes, the day's norms, the goal and the limit. */
export interface AgentSettings {
  enabled: boolean;
  /** Local time of the morning briefing, "HH:MM". */
  briefingTime: string;
  touchesPerDay: number;
  meetingsPerDay: number;
  goal: string;
  /** "YYYY-MM-DD" or null. */
  deadline: string | null;
  /** Most runs of the agent in one day (scheduled and by hand together): a stop against runaway cost. */
  dailyRunLimit: number;
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = { enabled: false, briefingTime: "08:00", touchesPerDay: 20, meetingsPerDay: 4, goal: "", deadline: null, dailyRunLimit: 40 };

export const AGENT_LIMITS = { touchesPerDay: [1, 200], meetingsPerDay: [0, 50], dailyRunLimit: [1, 200], goal: 120 } as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const clamp = (v: unknown, [min, max]: readonly [number, number], fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);

/** Whatever is stored (or missing, or damaged) becomes a complete, valid set of settings. */
export function cleanAgentSettings(raw: unknown): AgentSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_AGENT_SETTINGS;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : d.enabled,
    briefingTime: typeof r.briefingTime === "string" && TIME.test(r.briefingTime) ? r.briefingTime : d.briefingTime,
    touchesPerDay: clamp(r.touchesPerDay, AGENT_LIMITS.touchesPerDay, d.touchesPerDay),
    meetingsPerDay: clamp(r.meetingsPerDay, AGENT_LIMITS.meetingsPerDay, d.meetingsPerDay),
    goal: typeof r.goal === "string" ? r.goal.trim().slice(0, AGENT_LIMITS.goal) : d.goal,
    deadline: typeof r.deadline === "string" && DATE.test(r.deadline) && !Number.isNaN(Date.parse(`${r.deadline}T00:00:00Z`)) ? r.deadline : null,
    dailyRunLimit: clamp(r.dailyRunLimit, AGENT_LIMITS.dailyRunLimit, d.dailyRunLimit),
  };
}
