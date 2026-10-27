import { describe, expect, it } from "vitest";
import { dayScore, type DayCounts } from "@/modules/crm/day-score";

const counts = (over: Partial<DayCounts> = {}): DayCounts => ({ tasks: { planned: 0, done: 0 }, meetings: { planned: 0, done: 0 }, followUps: { planned: 0, done: 0 }, backlogOpen: 0, backlogCleared: 0, ...over });

describe("plan and fact of a day", () => {
  it("efficiency is done of planned, across tasks, meetings and follow-ups", () => {
    const s = dayScore(counts({ tasks: { planned: 4, done: 3 }, meetings: { planned: 2, done: 1 }, followUps: { planned: 2, done: 2 } }));
    expect(s).toMatchObject({ planned: 8, done: 6, efficiency: 75 });
  });

  it("without a plan there is nothing to measure, not zero or a division by zero", () => {
    expect(dayScore(counts())).toEqual({ planned: 0, done: 0, efficiency: null, productivity: null });
  });

  it("productivity counts the backlog: old debts cleared help, old debts left open weigh", () => {
    // planned 4 and 2 done; 3 old items finished today; 5 old items still open
    const s = dayScore(counts({ tasks: { planned: 4, done: 2 }, backlogCleared: 3, backlogOpen: 5 }));
    expect(s.efficiency).toBe(50);
    expect(s.productivity).toBe(Math.round(((2 + 3) / (4 + 5 + 3)) * 100)); // 42
  });

  it("a day with only a backlog still has a productivity", () => {
    expect(dayScore(counts({ backlogOpen: 3, backlogCleared: 1 }))).toMatchObject({ efficiency: null, productivity: 25 });
    expect(dayScore(counts({ backlogCleared: 2 })).productivity).toBe(100);
  });

  it("never reports more than was planned or more than 100 percent", () => {
    const s = dayScore(counts({ tasks: { planned: 2, done: 5 } }));
    expect(s).toMatchObject({ planned: 2, done: 2, efficiency: 100, productivity: 100 });
  });

  it("full marks and zero are both honest", () => {
    expect(dayScore(counts({ meetings: { planned: 3, done: 3 } })).efficiency).toBe(100);
    expect(dayScore(counts({ meetings: { planned: 3, done: 0 } })).efficiency).toBe(0);
  });
});
