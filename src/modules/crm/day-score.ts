/**
 * Plan versus fact for a day, and the two percentages shown under it.
 *
 * Planned: what falls on today (tasks due today, meetings and calls today, CRM follow-ups due today), done or not.
 * Done: the same things, finished (a meeting is held once it is over; a call or a follow-up is done when it is marked done).
 * Backlog: what was due before today and is still open, and what was due before today and was finished today.
 *
 * Efficiency: done of planned, the plain answer to "did I do what I had planned for today?".
 * Productivity: everything finished today (planned or from the backlog) of everything that wanted attention today
 * (planned plus the backlog, open or cleared). It rewards clearing old debts as well as keeping to the day's plan.
 */

export interface Pair {
  planned: number;
  done: number;
}

export interface DayCounts {
  tasks: Pair;
  meetings: Pair;
  followUps: Pair;
  /** Due before today and still open. */
  backlogOpen: number;
  /** Due before today and finished today. */
  backlogCleared: number;
}

export interface DayScore {
  planned: number;
  done: number;
  /** Whole percent, or null when nothing was planned. */
  efficiency: number | null;
  /** Whole percent, or null when nothing wanted attention. */
  productivity: number | null;
}

const percent = (part: number, whole: number): number | null => (whole > 0 ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : null);

export function dayScore(c: DayCounts): DayScore {
  const planned = c.tasks.planned + c.meetings.planned + c.followUps.planned;
  const done = Math.min(c.tasks.done, c.tasks.planned) + Math.min(c.meetings.done, c.meetings.planned) + Math.min(c.followUps.done, c.followUps.planned);
  return {
    planned,
    done,
    efficiency: percent(done, planned),
    productivity: percent(done + c.backlogCleared, planned + c.backlogOpen + c.backlogCleared),
  };
}
