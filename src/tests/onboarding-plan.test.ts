import { describe, expect, it } from "vitest";
import { cleanSteps, defaultSteps, planToTemplate, progressOf } from "@/modules/crm/onboarding-plan";
import { heatOf } from "@/modules/crm/team-tree";

describe("default plan", () => {
  it("is in each language and covers the first month", () => {
    for (const l of ["ru", "en", "pl", "uk"] as const) {
      const s = defaultSteps(l);
      expect(s.length).toBeGreaterThanOrEqual(7);
      expect(s.every((x) => x.title && x.day >= 0 && x.day + x.days <= 30)).toBe(true);
    }
    expect(defaultSteps("ru")[2]?.title).toContain("50");
  });
});

describe("cleanSteps", () => {
  it("drops empty titles, trims and keeps the days inside 30", () => {
    expect(cleanSteps([{ title: "  A ", day: 40, days: 99, checkpoint: true }, { title: " " }, 5, { title: "B", day: -3, days: 0 }])).toEqual([
      { title: "A", day: 29, days: 1, checkpoint: true },
      { title: "B", day: 0, days: 1, checkpoint: false },
    ]);
  });
  it("gives null when nothing is usable", () => {
    expect(cleanSteps(null)).toBeNull();
    expect(cleanSteps([])).toBeNull();
    expect(cleanSteps([{ title: "" }])).toBeNull();
  });
});

describe("planToTemplate", () => {
  it("makes a task for each step, in order of days, and a mentor's task after a checkpoint", () => {
    const { root, tasks } = planToTemplate(
      [
        { title: "Later", day: 10, days: 2, checkpoint: false },
        { title: "First", day: 1, days: 3, checkpoint: true },
      ],
      "en",
    );
    expect(tasks).toEqual([
      { title: "First", who: "newcomer" },
      { title: "Check with the newcomer: First", who: "mentor" },
      { title: "Later", who: "newcomer" },
    ]);
    expect(root.children?.map((c) => [c.title, c.offsetDays, c.durationDays])).toEqual([
      ["First", 1, 3],
      ["Check with the newcomer: First", 3, 1],
      ["Later", 10, 2],
    ]);
  });
});

describe("progressOf", () => {
  const at = new Date("2026-11-01T00:00:00Z");
  it("counts done tasks and names the next one", () => {
    const p = progressOf("p", at, [
      { title: "B", status: "TODO", position: 2048 },
      { title: "A", status: "DONE", position: 1024 },
      { title: "C", status: "TODO", position: 3072 },
    ]);
    expect(p).toMatchObject({ done: 1, total: 3, percent: 33, next: "B", finished: false });
  });
  it("is finished when everything is done", () => {
    expect(progressOf("p", at, [{ title: "A", status: "DONE", position: 1 }])).toMatchObject({ percent: 100, next: null, finished: true });
  });
});

describe("heat with onboarding", () => {
  const now = new Date("2026-11-20T00:00:00Z");
  const day = (n: number) => new Date(now.getTime() - n * 86_400_000);
  it("is red for an unfinished onboarding older than a week, even for someone at work", () => {
    expect(heatOf(day(1), day(60), now, undefined, { startedAt: day(8), finished: false })).toBe("red");
    expect(heatOf(day(1), day(60), now, undefined, { startedAt: day(5), finished: false })).toBe("green");
    expect(heatOf(day(1), day(60), now, undefined, { startedAt: day(20), finished: true })).toBe("green");
  });
});
