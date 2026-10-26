import { describe, expect, it } from "vitest";
import type { Health, NodeStatus, NodeType } from "@prisma/client";
import { canNest, whyCannotMove } from "@/modules/nodes/node-rules";
import { ancestorIds, computeProgress, type ProgressNode } from "@/modules/nodes/progress";
import {
  computeHealth,
  computeTreeHealth,
  type HealthChild,
  type HealthNode,
  type HealthTreeNode,
} from "@/modules/nodes/health";
import { between, evenPositions, needsRebalance } from "@/modules/nodes/position";
import { EMPTY_FILTER, filterCriteriaSchema, matchesFilter, type FilterableNode } from "@/modules/nodes/filters";
import { createNodeSchema, healthOverrideSchema, patchNodeSchema } from "@/modules/nodes/schemas";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("node-rules", () => {
  it.each([
    ["PROJECT", "EPIC", true],
    ["PROJECT", "DOCUMENT", true],
    ["PROJECT", "EVENT", true],
    ["PROJECT", "TASK", false],
    ["EPIC", "SPRINT", true],
    ["EPIC", "TASK", true],
    ["EPIC", "EVENT", false],
    ["SPRINT", "TASK", true],
    ["SPRINT", "EVENT", true],
    ["SPRINT", "SPRINT", false],
    ["TASK", "SUBTASK", true],
    ["TASK", "DOCUMENT", true],
    ["TASK", "TASK", false],
    ["SUBTASK", "SUBTASK", false],
    ["DOCUMENT", "TASK", false],
  ] as [NodeType, NodeType, boolean][])("%s → %s is %s", (p, c, ok) => {
    expect(canNest(p, c)).toBe(ok);
  });

  it("only projects can be roots", () => {
    expect(canNest(null, "PROJECT")).toBe(true);
    expect(canNest(null, "TASK")).toBe(false);
  });

  const task = { id: "t", type: "TASK" as const, workspaceId: "w", parentId: "s1" };
  const sprint = (id: string) => ({ id, type: "SPRINT" as const, workspaceId: "w", parentId: "e" });

  it("allows moving a task to another sprint", () => {
    expect(whyCannotMove(task, sprint("s2"), ["s2", "e", "p"], true)).toBeNull();
  });
  it("denies cycles, self, foreign workspace/project and wrong types", () => {
    const epic = { id: "e", type: "EPIC" as const, workspaceId: "w", parentId: "p" };
    expect(whyCannotMove(epic, sprint("s2"), ["s2", "e", "p"], true)).toBe("cycle");
    expect(whyCannotMove(task, { ...task }, ["t"], true)).toBe("self");
    expect(whyCannotMove(task, { ...sprint("s2"), workspaceId: "x" }, [], true)).toBe("other_workspace");
    expect(whyCannotMove(task, sprint("s2"), ["s2"], false)).toBe("other_project");
    expect(whyCannotMove(sprint("s2"), { ...task, id: "t2" }, ["t2"], true)).toBe("type_not_allowed");
    expect(whyCannotMove(task, null, [], true)).toBe("root_only_project");
  });
});

describe("computeProgress", () => {
  const n = (
    id: string,
    parentId: string | null,
    type: NodeType,
    progress = 0,
    estimation: number | null = null,
    extra: Partial<ProgressNode> = {},
  ): ProgressNode => ({
    id,
    parentId,
    type,
    status: "TODO",
    progress,
    progressMode: "MANUAL",
    estimation,
    ...extra,
  });

  it("weights children by estimation", () => {
    const p = computeProgress([
      n("p", null, "PROJECT"),
      n("a", "p", "TASK", 100, 8),
      n("b", "p", "TASK", 0, 2),
    ]);
    expect(p.get("p")).toBe(80);
  });

  it("falls back to a simple mean without estimations", () => {
    const p = computeProgress([n("p", null, "PROJECT"), n("a", "p", "TASK", 100), n("b", "p", "TASK", 50)]);
    expect(p.get("p")).toBe(75);
  });

  it("gives unestimated siblings the mean known weight", () => {
    // known weights: 10 → fallback 10; so a(100,10) and b(0,?) weigh the same.
    const p = computeProgress([n("p", null, "PROJECT"), n("a", "p", "TASK", 100, 10), n("b", "p", "TASK", 0)]);
    expect(p.get("p")).toBe(50);
  });

  it("ignores documents, events and cancelled work", () => {
    const p = computeProgress([
      n("p", null, "PROJECT"),
      n("a", "p", "TASK", 100),
      n("doc", "p", "DOCUMENT", 0),
      n("ev", "p", "EVENT", 0),
      n("x", "p", "TASK", 0, null, { status: "CANCELLED" }),
    ]);
    expect(p.get("p")).toBe(100);
  });

  it("rolls up through several levels with summed descendant weights", () => {
    const p = computeProgress([
      n("p", null, "PROJECT"),
      n("e1", "p", "EPIC"),
      n("e2", "p", "EPIC"),
      n("s1", "e1", "SPRINT"),
      n("t1", "s1", "TASK", 100, 6),
      n("t2", "s1", "TASK", 0, 2),
      n("t3", "e2", "TASK", 0, 8),
    ]);
    expect(p.get("s1")).toBe(75);
    expect(p.get("e1")).toBe(75);
    // e1 weight 8, e2 weight 8
    expect(p.get("p")).toBe(38);
  });

  it("derives AUTO tasks from subtasks and leaves MANUAL tasks alone", () => {
    const nodes = [
      n("p", null, "PROJECT"),
      n("auto", "p", "TASK", 0, null, { progressMode: "AUTO" }),
      n("manual", "p", "TASK", 40, null, { progressMode: "MANUAL" }),
      n("s1", "auto", "SUBTASK", 100),
      n("s2", "auto", "SUBTASK", 50),
      n("s3", "manual", "SUBTASK", 100),
    ];
    const p = computeProgress(nodes);
    expect(p.get("auto")).toBe(75);
    expect(p.get("manual")).toBe(40);
  });

  it("keeps a container's stored value when it has no counting children", () => {
    expect(computeProgress([n("p", null, "PROJECT", 30)]).get("p")).toBe(30);
  });

  it("finds ancestors nearest first", () => {
    const nodes = [n("p", null, "PROJECT"), n("e", "p", "EPIC"), n("t", "e", "TASK")];
    expect(ancestorIds(nodes, "t")).toEqual(["e", "p"]);
    expect(ancestorIds(nodes, "p")).toEqual([]);
  });
});

describe("computeHealth", () => {
  const today = d("2026-10-20");
  const base: HealthNode = {
    type: "TASK",
    status: "IN_PROGRESS",
    progress: 50,
    startDate: d("2026-10-10"),
    dueDate: d("2026-10-30"),
    assigneeId: "u1",
    healthOverride: null,
    hasActiveBlocker: false,
  };
  const h = (over: Partial<HealthNode>, children: HealthChild[] = []): Health =>
    computeHealth({ ...base, ...over }, children, today);
  const kid = (health: Health): HealthChild => ({ type: "TASK", status: "TODO", health });

  it("is green on track", () => expect(h({})).toBe("GREEN")); // expected 50%, progress 50

  it("is red when overdue and unfinished", () => {
    expect(h({ dueDate: d("2026-10-19"), progress: 90 })).toBe("RED");
  });
  it("is not overdue on the due day itself", () => {
    expect(h({ dueDate: d("2026-10-20"), startDate: d("2026-10-10"), progress: 100 })).toBe("GREEN");
  });
  it("treats finished work as green even when late", () => {
    expect(h({ dueDate: d("2026-10-01"), progress: 100 })).toBe("GREEN");
    expect(h({ dueDate: d("2026-10-01"), status: "DONE" })).toBe("GREEN");
    expect(h({ dueDate: d("2026-10-01"), status: "CANCELLED" })).toBe("GREEN");
  });
  it("is red with an active blocker", () => expect(h({ hasActiveBlocker: true })).toBe("RED"));

  it.each([
    // window Oct 10 → Oct 30, today Oct 20 → expected progress 50
    [19, "RED"], // lag 31
    [20, "YELLOW"], // lag exactly 30 is still yellow (10–30 inclusive)
    [21, "YELLOW"], // lag 29
    [40, "YELLOW"], // lag exactly 10
    [41, "GREEN"], // lag 9
  ] as [number, Health][])("lag handling at progress %i → %s", (progress, expected) => {
    expect(h({ progress })).toBe(expected);
  });

  it("is yellow in the last 20% of the time with progress under 70", () => {
    // 21-day window, 2 days left (~9.5%), expected ≈ 90.5.
    const n: Partial<HealthNode> = { startDate: d("2026-10-01"), dueDate: d("2026-10-22") };
    expect(h({ ...n, progress: 65 })).toBe("YELLOW"); // lag ≈ 25
    expect(h({ ...n, progress: 60 })).toBe("RED"); // lag ≈ 30.5
    expect(h({ ...n, progress: 85 })).toBe("GREEN");
  });

  it("is yellow for an unassigned task but not for a sprint", () => {
    expect(h({ assigneeId: null })).toBe("YELLOW");
    expect(h({ type: "SPRINT", assigneeId: null })).toBe("GREEN");
  });

  it("needs both dates for time-based rules", () => {
    expect(h({ startDate: null, progress: 0 })).toBe("GREEN");
    expect(h({ dueDate: null, progress: 0 })).toBe("GREEN");
  });

  it("applies the 25% red-children rule to parents", () => {
    const p: Partial<HealthNode> = { type: "SPRINT", assigneeId: null, startDate: null, dueDate: null };
    expect(h(p, [kid("RED"), kid("GREEN"), kid("GREEN"), kid("GREEN")])).toBe("GREEN"); // exactly 25%
    expect(h(p, [kid("RED"), kid("RED"), kid("GREEN"), kid("GREEN")])).toBe("RED"); // 50%
    expect(h(p, [kid("RED"), kid("GREEN"), kid("GREEN")])).toBe("RED"); // 33%
  });
  it("does not count documents or cancelled children", () => {
    const p: Partial<HealthNode> = { type: "SPRINT", startDate: null, dueDate: null };
    const doc: HealthChild = { type: "DOCUMENT", status: "TODO", health: "RED" };
    const cancelled: HealthChild = { type: "TASK", status: "CANCELLED", health: "RED" };
    expect(h(p, [doc, cancelled, kid("GREEN")])).toBe("GREEN");
  });
  it("lets a parent fall back to its own rules when few children are red", () => {
    expect(h({ type: "EPIC", dueDate: d("2026-10-01") }, [kid("GREEN")])).toBe("RED");
  });

  it("honours a manual override over everything", () => {
    expect(h({ healthOverride: "GREEN", dueDate: d("2026-01-01"), hasActiveBlocker: true })).toBe("GREEN");
    expect(h({ healthOverride: "RED", progress: 100 })).toBe("RED");
  });
});

describe("computeTreeHealth", () => {
  it("propagates red from leaves to parents", () => {
    const base = {
      status: "IN_PROGRESS" as NodeStatus,
      progress: 0,
      startDate: null,
      dueDate: null,
      assigneeId: "u",
      healthOverride: null,
      hasActiveBlocker: false,
    };
    const nodes: HealthTreeNode[] = [
      { ...base, id: "p", parentId: null, type: "PROJECT" },
      { ...base, id: "s", parentId: "p", type: "SPRINT" },
      { ...base, id: "t", parentId: "s", type: "TASK", dueDate: d("2026-01-01") },
    ];
    const res = computeTreeHealth(nodes, d("2026-10-20"));
    expect(res.get("t")).toBe("RED");
    expect(res.get("s")).toBe("RED");
    expect(res.get("p")).toBe("RED");
  });
});

describe("position", () => {
  it("handles empty, append, prepend and between", () => {
    expect(between(null, null)).toBe(1024);
    expect(between(1024, null)).toBe(2048);
    expect(between(null, 1024)).toBe(0);
    expect(between(1, 2)).toBe(1.5);
  });
  it("detects exhausted precision and rebalances evenly", () => {
    expect(needsRebalance(1, 1 + 1e-9)).toBe(true);
    expect(needsRebalance(1, 2)).toBe(false);
    expect(evenPositions(3)).toEqual([1024, 2048, 3072]);
  });
});

describe("matchesFilter", () => {
  const now = d("2026-10-21"); // Wednesday
  const node: FilterableNode = {
    title: "Build Login Page",
    type: "TASK",
    status: "IN_PROGRESS",
    health: "YELLOW",
    progress: 40,
    assigneeId: "u1",
    dueDate: d("2026-10-23"),
    tagIds: ["t1"],
  };
  const f = (over: Record<string, unknown>) => filterCriteriaSchema.parse(over);

  it("matches everything with an empty filter", () => expect(matchesFilter(node, EMPTY_FILTER, now)).toBe(true));
  it("combines criteria with AND and values with OR", () => {
    expect(matchesFilter(node, f({ statuses: ["DONE", "IN_PROGRESS"], healths: ["YELLOW"] }), now)).toBe(true);
    expect(matchesFilter(node, f({ statuses: ["IN_PROGRESS"], healths: ["RED"] }), now)).toBe(false);
  });
  it("searches titles case-insensitively", () => {
    expect(matchesFilter(node, f({ q: "login" }), now)).toBe(true);
    expect(matchesFilter(node, f({ q: "signup" }), now)).toBe(false);
  });
  it("filters by assignee and tag", () => {
    expect(matchesFilter(node, f({ assigneeIds: ["u2"] }), now)).toBe(false);
    expect(matchesFilter(node, f({ tagIds: ["t9", "t1"] }), now)).toBe(true);
    expect(matchesFilter({ ...node, assigneeId: null }, f({ assigneeIds: ["u1"] }), now)).toBe(false);
  });
  it("handles deadline buckets (weeks start on Monday)", () => {
    expect(matchesFilter(node, f({ due: "this_week" }), now)).toBe(true);
    expect(matchesFilter({ ...node, dueDate: d("2026-10-26") }, f({ due: "next_week" }), now)).toBe(true);
    expect(matchesFilter({ ...node, dueDate: d("2026-10-19") }, f({ due: "overdue" }), now)).toBe(true);
    expect(matchesFilter({ ...node, dueDate: d("2026-10-19"), progress: 100 }, f({ due: "overdue" }), now)).toBe(false);
    expect(matchesFilter({ ...node, dueDate: null }, f({ due: "this_week" }), now)).toBe(false);
  });
});

describe("schemas", () => {
  it("requires a comment for a health override", () => {
    expect(healthOverrideSchema.safeParse({ health: "GREEN", note: "" }).success).toBe(false);
    expect(healthOverrideSchema.safeParse({ health: "GREEN", note: "Waiting for client sign-off" }).success).toBe(true);
  });
  it("rejects empty patches and out-of-range progress", () => {
    expect(patchNodeSchema.safeParse({}).success).toBe(false);
    expect(patchNodeSchema.safeParse({ progress: 101 }).success).toBe(false);
    expect(patchNodeSchema.safeParse({ progress: 40 }).success).toBe(true);
  });
  it("validates creation input", () => {
    expect(createNodeSchema.safeParse({ parentId: null, type: "PROJECT", title: "  " }).success).toBe(false);
    expect(createNodeSchema.safeParse({ parentId: "x", type: "TASK", title: "Do it" }).success).toBe(true);
    expect(createNodeSchema.safeParse({ parentId: "x", type: "DEAL", title: "No" }).success).toBe(false);
  });
});
