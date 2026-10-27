/**
 * A list of tasks typed as plain lines becomes tasks with their subtasks.
 *
 *   Prepare the launch
 *     Write the announcement      ← a line with an indent
 *     Book the venue
 *   Update the website
 *   - Check the links            ← or, with no indents at all, a line that starts with a dash
 *
 * Indentation decides when there is any; otherwise dashes and bullets under a plain line make subtasks.
 * Numbering ("1." or "1)") and a leading dash are only decoration and are removed. A task has one level of subtasks:
 * anything indented deeper than that becomes a subtask of the nearest task as well.
 */

export interface OutlineTask {
  title: string;
  subtasks: string[];
}

export const OUTLINE_LIMITS = { tasks: 40, subtasksPerTask: 30, total: 100, title: 200 } as const;

const MARKER = /^(?:[-*•–—]+|\d{1,3}[.)])\s+/;
const ONLY_MARKER = /^(?:[-*•–—]+|\d{1,3}[.)])$/;

function parseLine(raw: string): { indent: number; marked: boolean; title: string } | null {
  const line = raw.replace(/\s+$/, "");
  if (!line.trim()) return null;
  const indent = (/^[ \t]*/.exec(line)?.[0] ?? "").replace(/\t/g, "  ").length;
  let rest = line.trim();
  if (ONLY_MARKER.test(rest)) return null;
  const marked = MARKER.test(rest);
  while (MARKER.test(rest)) rest = rest.replace(MARKER, "");
  rest = rest.trim().slice(0, OUTLINE_LIMITS.title);
  return rest ? { indent, marked, title: rest } : null;
}

export function parseTaskOutline(text: string): { tasks: OutlineTask[]; count: { tasks: number; subtasks: number }; truncated: boolean } {
  const lines = text.split(/\r?\n/).map(parseLine).filter((l): l is NonNullable<typeof l> => l !== null);
  // A block pasted with a common indent is not a list of subtasks: only indent beyond the least indented line counts.
  const base = Math.min(...lines.map((l) => l.indent), Infinity);
  const rel = (l: (typeof lines)[number]) => l.indent - base;
  const anyIndent = lines.some((l) => rel(l) > 0);
  const anyPlain = lines.some((l) => !l.marked);
  const isSub = (l: (typeof lines)[number]): boolean => (anyIndent ? rel(l) > 0 : anyPlain && l.marked);

  const tasks: OutlineTask[] = [];
  let truncated = false;
  let total = 0;
  for (const l of lines) {
    if (total >= OUTLINE_LIMITS.total) {
      truncated = true;
      break;
    }
    const current = tasks[tasks.length - 1];
    if (isSub(l) && current) {
      if (current.subtasks.length >= OUTLINE_LIMITS.subtasksPerTask) truncated = true;
      else {
        current.subtasks.push(l.title);
        total++;
      }
    } else if (tasks.length >= OUTLINE_LIMITS.tasks) {
      truncated = true;
    } else {
      tasks.push({ title: l.title, subtasks: [] });
      total++;
    }
  }
  return { tasks, count: { tasks: tasks.length, subtasks: tasks.reduce((n, t) => n + t.subtasks.length, 0) }, truncated };
}
