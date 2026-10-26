import { describe, expect, it } from "vitest";
import type { NodeStatus } from "@prisma/client";
import { averageVelocity, cumulativeFlow, cycleTimes, doneInfo, percentile, sprintVelocity, throughput, type StatusEv } from "@/modules/metrics/agile";
import { bySource, forecast, funnel, managerActivity, winLoss, type StageInfo } from "@/modules/metrics/sales";

const at = (s: string) => new Date(`${s}Z`);
const ev = (nodeId: string, when: string, from: NodeStatus | null, to: NodeStatus): StatusEv => ({ nodeId, at: at(when), from, to });

describe("cumulative flow", () => {
  const events = [
    ev("a", "2026-10-01T10:00:00", null, "TODO"),
    ev("a", "2026-10-02T10:00:00", "TODO", "IN_PROGRESS"),
    ev("a", "2026-10-04T10:00:00", "IN_PROGRESS", "DONE"),
    ev("b", "2026-10-02T09:00:00", null, "BACKLOG"),
    ev("c", "2026-10-03T09:00:00", null, "TODO"),
    ev("c", "2026-10-03T12:00:00", "TODO", "CANCELLED"),
  ];
  it("replays history into daily column counts", () => {
    const flow = cumulativeFlow(events, at("2026-10-01T00:00:00"), at("2026-10-04T00:00:00"));
    expect(flow.map((p) => p.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(flow[0]).toMatchObject({ TODO: 1, IN_PROGRESS: 0, DONE: 0, BACKLOG: 0 });
    expect(flow[1]).toMatchObject({ TODO: 0, IN_PROGRESS: 1, BACKLOG: 1 }); // b appears the day it is created
    expect(flow[2]).toMatchObject({ IN_PROGRESS: 1, BACKLOG: 1 }); // c was cancelled the same day, so it never shows at day end
    expect(flow[3]).toMatchObject({ DONE: 1, IN_PROGRESS: 0, BACKLOG: 1 });
  });
  it("keeps every day's total equal to the live tasks and handles an empty history", () => {
    const flow = cumulativeFlow(events, at("2026-10-01T00:00:00"), at("2026-10-04T00:00:00"));
    expect(flow.map((p) => p.BACKLOG + p.TODO + p.IN_PROGRESS + p.IN_REVIEW + p.DONE)).toEqual([1, 2, 2, 2]);
    expect(cumulativeFlow([], at("2026-10-01T00:00:00"), at("2026-10-02T00:00:00")).every((p) => p.DONE === 0)).toBe(true);
  });
  it("caps the span at about half a year", () => {
    expect(cumulativeFlow([], at("2024-01-01T00:00:00"), at("2026-01-01T00:00:00")).length).toBeLessThanOrEqual(181);
  });
});

describe("done info and cycle time", () => {
  const events = [
    ev("a", "2026-10-01T00:00:00", null, "TODO"),
    ev("a", "2026-10-02T00:00:00", "TODO", "IN_PROGRESS"),
    ev("a", "2026-10-06T12:00:00", "IN_PROGRESS", "DONE"),
    ev("b", "2026-10-01T00:00:00", null, "TODO"),
    ev("b", "2026-10-03T00:00:00", "TODO", "IN_PROGRESS"),
    ev("b", "2026-10-04T00:00:00", "IN_PROGRESS", "DONE"),
    ev("b", "2026-10-05T00:00:00", "DONE", "IN_PROGRESS"), // reopened: not done any more
    ev("c", "2026-10-01T00:00:00", null, "DONE"), // imported as done
    ev("d", "2026-10-01T00:00:00", null, "TODO"),
    ev("d", "2026-10-02T00:00:00", "TODO", "IN_PROGRESS"),
    ev("d", "2026-10-03T00:00:00", "IN_PROGRESS", "DONE"),
  ];
  it("knows when a task last became done and whether it still is", () => {
    const info = doneInfo(events);
    expect(info.get("a")?.doneAt?.toISOString()).toBe("2026-10-06T12:00:00.000Z");
    expect(info.get("b")).toMatchObject({ status: "IN_PROGRESS", doneAt: null });
    expect(info.get("c")?.doneAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
  it("measures progress-to-done in days, skipping reopened and never-started tasks", () => {
    const { days, summary } = cycleTimes(events);
    expect(days).toEqual([1, 4.5]); // d and a
    expect(summary).toEqual({ count: 2, average: 2.8, p50: 1, p85: 4.5, p95: 4.5 });
  });
  it("percentiles use nearest rank", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect([percentile(xs, 50), percentile(xs, 85), percentile(xs, 95), percentile(xs, 100)]).toEqual([5, 9, 10, 10]);
    expect(percentile([], 50)).toBeNull();
    expect(cycleTimes([]).summary).toEqual({ count: 0, average: null, p50: null, p85: null, p95: null });
  });
});

describe("throughput", () => {
  it("counts tasks per week, oldest first, with empty weeks as zero", () => {
    const events = [
      ev("a", "2026-10-12T10:00:00", "TODO", "DONE"), // week of Oct 12
      ev("b", "2026-10-20T10:00:00", "TODO", "DONE"), // week of Oct 19
      ev("c", "2026-10-22T10:00:00", "TODO", "DONE"),
      ev("d", "2026-08-01T10:00:00", "TODO", "DONE"), // outside the window
    ];
    const t = throughput(events, 3, at("2026-10-26T08:00:00"), new Map([["b", 3], ["c", 2]]));
    expect(t.map((w) => w.week)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(t.map((w) => w.done)).toEqual([1, 2, 0]);
    expect(t[1]?.weight).toBe(5);
  });
});

describe("sprint velocity", () => {
  const sprints = [
    { id: "s2", title: "Sprint 2", startDate: at("2026-10-12T00:00:00"), dueDate: at("2026-10-25T00:00:00") },
    { id: "s1", title: "Sprint 1", startDate: at("2026-09-28T00:00:00"), dueDate: at("2026-10-11T00:00:00") },
    { id: "s3", title: "Sprint 3", startDate: at("2026-10-26T00:00:00"), dueDate: at("2026-11-08T00:00:00") },
  ];
  const tasks = [
    { id: "t1", weight: 5, sprintId: "s1" },
    { id: "t2", weight: 3, sprintId: "s1" },
    { id: "t3", weight: 8, sprintId: "s2" },
    { id: "t4", weight: 2, sprintId: "s2" },
    { id: "t5", weight: 4, sprintId: "s2" },
    { id: "t6", weight: 1, sprintId: "s3" },
  ];
  const done = new Map<string, { status: NodeStatus; doneAt: Date | null }>([
    ["t1", { status: "DONE", doneAt: at("2026-10-05T00:00:00") }],
    ["t2", { status: "DONE", doneAt: at("2026-10-11T18:00:00") }], // on the due day: counts
    ["t3", { status: "DONE", doneAt: at("2026-10-20T00:00:00") }],
    ["t4", { status: "DONE", doneAt: at("2026-10-27T00:00:00") }], // after the sprint: carried over
    ["t5", { status: "CANCELLED", doneAt: null }], // cancelled work is not committed
    ["t6", { status: "TODO", doneAt: null }],
  ]);
  const rows = sprintVelocity(sprints, tasks, done, at("2026-10-26T12:00:00"));
  it("compares committed with completed per sprint, in date order", () => {
    expect(rows.map((r) => [r.title, r.committed, r.completed, r.finished])).toEqual([
      ["Sprint 1", 8, 8, true],
      ["Sprint 2", 10, 8, true],
      ["Sprint 3", 1, 0, false],
    ]);
  });
  it("averages only finished sprints", () => {
    expect(averageVelocity(rows)).toBe(8);
    expect(averageVelocity(rows.filter((r) => !r.finished))).toBeNull();
    expect(averageVelocity(rows, 1)).toBe(8);
  });
});

describe("funnel", () => {
  const stages: StageInfo[] = [
    { id: "new", name: "New", order: 0, probability: 10, isWon: false, isLost: false },
    { id: "qual", name: "Qualified", order: 1, probability: 30, isWon: false, isLost: false },
    { id: "prop", name: "Proposal", order: 2, probability: 60, isWon: false, isLost: false },
    { id: "won", name: "Won", order: 3, probability: 100, isWon: true, isLost: false },
    { id: "lost", name: "Lost", order: 4, probability: 0, isWon: false, isLost: true },
  ];
  const e = (dealId: string, toStageId: string) => ({ dealId, toStageId, at: at("2026-10-01T00:00:00") });
  it("counts deals up to the furthest stage they reached and reports step conversion", () => {
    const f = funnel(stages, [e("a", "new"), e("a", "qual"), e("a", "prop"), e("a", "won"), e("b", "new"), e("b", "qual"), e("b", "lost"), e("c", "new"), e("d", "new"), e("d", "prop")]);
    expect(f.rows.map((r) => [r.name, r.reached, r.conversion])).toEqual([["New", 4, null], ["Qualified", 3, 0.75], ["Proposal", 2, 0.67], ["Won", 1, 0.5]]);
    expect(f.lost).toBe(1);
    expect(f.deals).toBe(4);
  });
  it("copes with no history", () => {
    expect(funnel(stages, []).rows.map((r) => r.reached)).toEqual([0, 0, 0, 0]);
  });
});

describe("forecast", () => {
  it("weights by probability, per currency and expected-close month", () => {
    const f = forecast([
      { id: "1", amount: 1000, currency: "EUR", probability: 50, expectedCloseDate: at("2026-11-10T00:00:00") },
      { id: "2", amount: 200, currency: "EUR", probability: 100, expectedCloseDate: at("2026-11-30T00:00:00") },
      { id: "3", amount: 400, currency: "EUR", probability: 25, expectedCloseDate: at("2026-10-31T00:00:00") },
      { id: "4", amount: 100, currency: "EUR", probability: 10, expectedCloseDate: null },
      { id: "5", amount: 5000, currency: "PLN", probability: 20, expectedCloseDate: at("2026-12-01T00:00:00") },
    ]);
    expect(f.EUR).toEqual([
      { month: "2026-10", count: 1, total: 400, weighted: 100 },
      { month: "2026-11", count: 2, total: 1200, weighted: 700 },
      { month: "none", count: 1, total: 100, weighted: 10 },
    ]);
    expect(f.PLN).toEqual([{ month: "2026-12", count: 1, total: 5000, weighted: 1000 }]);
  });
});

describe("win/loss, sources and managers", () => {
  const closed = [
    { amount: 1000, currency: "EUR", outcome: "won" as const, lostReason: null, createdAt: at("2026-09-01T00:00:00"), closedAt: at("2026-09-11T00:00:00"), source: "web" },
    { amount: 500, currency: "EUR", outcome: "won" as const, lostReason: null, createdAt: at("2026-09-01T00:00:00"), closedAt: at("2026-09-21T00:00:00"), source: "web" },
    { amount: 700, currency: "PLN", outcome: "won" as const, lostReason: null, createdAt: at("2026-09-01T00:00:00"), closedAt: at("2026-10-01T00:00:00"), source: null },
    { amount: 300, currency: "EUR", outcome: "lost" as const, lostReason: "Price", createdAt: at("2026-09-01T00:00:00"), closedAt: at("2026-09-05T00:00:00"), source: "ads" },
    { amount: 100, currency: "EUR", outcome: "lost" as const, lostReason: "Price", createdAt: at("2026-09-01T00:00:00"), closedAt: at("2026-09-05T00:00:00"), source: "ads" },
    { amount: 50, currency: "EUR", outcome: "lost" as const, lostReason: "No budget", createdAt: at("2026-09-01T00:00:00"), closedAt: at("2026-09-05T00:00:00"), source: "ads" },
  ];
  it("summarises outcomes without mixing currencies", () => {
    const w = winLoss(closed);
    expect(w).toMatchObject({ won: 3, lost: 3, winRate: 0.5, wonAmount: { EUR: 1500, PLN: 700 }, lostAmount: { EUR: 450 } });
    expect(w.reasons).toEqual([{ reason: "Price", count: 2 }, { reason: "No budget", count: 1 }]);
    expect(w.avgCycleDays).toBe(20);
    expect(w.medianCycleDays).toBe(20);
    expect(winLoss([])).toMatchObject({ won: 0, lost: 0, winRate: null, avgCycleDays: null, medianCycleDays: null });
  });
  it("ranks sources by volume with their conversion", () => {
    const s = bySource(closed.map((d) => ({ source: d.source, won: d.outcome === "won", amount: d.amount, currency: d.currency })));
    expect(s.map((r) => [r.source, r.deals, r.won, r.conversion])).toEqual([["ads", 3, 0, 0], ["web", 2, 2, 1], ["unknown", 1, 1, 1]]);
    expect(s.find((r) => r.source === "web")?.wonAmount).toEqual({ EUR: 1500 });
  });
  it("counts each manager's finished work and won deals", () => {
    const m = managerActivity(
      [{ ownerId: "ann", type: "CALL" }, { ownerId: "ann", type: "CALL" }, { ownerId: "ann", type: "TASK" }, { ownerId: "bob", type: "MEETING" }, { ownerId: "bob", type: "EMAIL" }, { ownerId: "bob", type: "NOTE" }],
      [{ ownerId: "bob", amount: 100, currency: "EUR" }, { ownerId: "bob", amount: 50, currency: "EUR" }, { ownerId: null, amount: 9, currency: "EUR" }],
    );
    expect(m[0]).toMatchObject({ ownerId: "bob", dealsWon: 2, wonAmount: { EUR: 150 }, meetings: 1, emails: 1, notes: 1 });
    expect(m[1]).toMatchObject({ ownerId: "ann", calls: 2, tasksDone: 1, dealsWon: 0 });
  });
});
