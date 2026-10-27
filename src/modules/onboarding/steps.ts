import { addDays } from "@/modules/crm/tracker";

/** What the person has done so far, counted from their own data; the steps are judged against it. */
export interface Facts {
  timezoneSet: boolean;
  tasksCreated: number;
  timeEntries: number;
  notes: number;
  hasDream: boolean;
  people: number;
  peopleMoved: number;
  nextSteps: number;
  scripts: number;
  rules: number;
  weekGoals: boolean;
  stepsClosed: number;
  groups: number;
  partners: number;
}

export type Block = "platform" | "business";
export type StepId = "profile" | "firstTask" | "timer" | "notes" | "dream" | "list" | "funnel" | "nextSteps" | "scripts" | "weekGoals" | "firstDay" | "groups" | "partners";

export interface StepDef {
  id: StepId;
  block: Block;
  /** Not needed to finish: a step for those who want to go further. */
  optional?: boolean;
  /** The part of the app where the step is done, relative to the workspace (a CRM step is hidden from people without CRM access). */
  path: string;
  crm?: boolean;
  done: (f: Facts) => boolean;
  /** How far along, when the step is a count: `value` of `goal`. */
  progress?: (f: Facts) => { value: number; goal: number };
}

export const LIST_GOAL = 100;
/** The list counts as started at this many names; the board then shows the way to a hundred. */
export const LIST_STARTED = 25;

const capped = (value: number, goal: number) => ({ value: Math.min(value, goal), goal });

export const STEPS: StepDef[] = [
  { id: "profile", block: "platform", path: "/settings", done: (f) => f.timezoneSet },
  { id: "firstTask", block: "platform", path: "/tasks", done: (f) => f.tasksCreated >= 1 },
  { id: "timer", block: "platform", path: "/time", done: (f) => f.timeEntries >= 1 },
  { id: "notes", block: "platform", path: "/notes", done: (f) => f.notes >= 1 },
  { id: "dream", block: "business", path: "/start", done: (f) => f.hasDream },
  { id: "list", block: "business", path: "/crm/people", crm: true, done: (f) => f.people >= LIST_STARTED, progress: (f) => capped(f.people, LIST_GOAL) },
  { id: "funnel", block: "business", path: "/crm/people", crm: true, done: (f) => f.peopleMoved >= 5, progress: (f) => capped(f.peopleMoved, 5) },
  { id: "nextSteps", block: "business", path: "/crm/people", crm: true, done: (f) => f.nextSteps >= 5, progress: (f) => capped(f.nextSteps, 5) },
  { id: "scripts", block: "business", path: "/crm/scripts", crm: true, done: (f) => f.scripts >= 1 && f.rules >= 1 },
  { id: "weekGoals", block: "business", path: "/crm/day", crm: true, done: (f) => f.weekGoals },
  { id: "firstDay", block: "business", path: "/crm/day", crm: true, done: (f) => f.stepsClosed >= 3, progress: (f) => capped(f.stepsClosed, 3) },
  { id: "groups", block: "business", optional: true, path: "/crm/people", crm: true, done: (f) => f.groups >= 1 },
  { id: "partners", block: "business", optional: true, path: "/crm/team", crm: true, done: (f) => f.partners >= 1 },
];

export type StepStatus = "done" | "skipped" | "todo";

export interface StepView {
  id: StepId;
  block: Block;
  optional: boolean;
  path: string;
  status: StepStatus;
  progress: { value: number; goal: number } | null;
}

export interface Evaluation {
  steps: StepView[];
  /** The steps that must be done (not optional, not set aside). */
  required: number;
  done: number;
  percent: number;
  /** The first step still to do, in order. */
  next: StepId | null;
}

/**
 * The steps as they stand: done by what the person's data shows, skipped if they set it aside, else still to do.
 * A step that needs the CRM is left out for someone who cannot use it. Optional and skipped steps do not hold the progress back.
 */
export function evaluate(facts: Facts, skipped: readonly string[], opts: { crm: boolean }): Evaluation {
  const steps: StepView[] = STEPS.filter((s) => opts.crm || !s.crm).map((s) => {
    const isDone = s.done(facts);
    return { id: s.id, block: s.block, optional: !!s.optional, path: s.path, status: isDone ? "done" : skipped.includes(s.id) ? "skipped" : "todo", progress: s.progress ? s.progress(facts) : null };
  });
  const counted = steps.filter((s) => !s.optional && s.status !== "skipped");
  const done = counted.filter((s) => s.status === "done").length;
  const required = counted.length;
  return { steps, required, done, percent: required === 0 ? 100 : Math.round((done / required) * 100), next: steps.find((s) => s.status === "todo" && !s.optional)?.id ?? null };
}

export interface Goal {
  targetClients: number | null;
  targetPartners: number | null;
  /** YYYY-MM-DD */
  targetDate: string | null;
}

export interface Distance {
  clients: { have: number; target: number; left: number } | null;
  partners: { have: number; target: number; left: number } | null;
  /** Days to the date; negative once it has passed; null with no date. */
  daysLeft: number | null;
  /** How much of the target is won, 0 to 100; null with no target. */
  percent: number | null;
  /** The pace needed from today: how many more clients and partners a week until the date; null without a date in the future. */
  perWeek: { clients: number; partners: number } | null;
}

/** How far the person is from what they wrote down: what is won (clients, partners) against the targets, and how long is left. */
export function dreamDistance(goal: Goal, have: { clients: number; partners: number }, today: string): Distance {
  const part = (target: number | null, got: number) => (target && target > 0 ? { have: got, target, left: Math.max(0, target - got) } : null);
  const clients = part(goal.targetClients, have.clients);
  const partners = part(goal.targetPartners, have.partners);
  const total = (clients?.target ?? 0) + (partners?.target ?? 0);
  const won = (clients ? Math.min(clients.have, clients.target) : 0) + (partners ? Math.min(partners.have, partners.target) : 0);
  const daysLeft = goal.targetDate ? Math.round((new Date(`${goal.targetDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000) : null;
  const weeks = daysLeft !== null && daysLeft > 0 ? daysLeft / 7 : null;
  return {
    clients,
    partners,
    daysLeft,
    percent: total > 0 ? Math.round((won / total) * 100) : null,
    perWeek: weeks ? { clients: Math.round(((clients?.left ?? 0) / weeks) * 10) / 10, partners: Math.round(((partners?.left ?? 0) / weeks) * 10) / 10 } : null,
  };
}

export const defaultTargetDate = (today: string) => addDays(today, 365);
