import type { Node } from "@prisma/client";
import { db } from "@/server/db";
import { createLink, createNode, createProject, patchNode, transact } from "./nodes/ops";
import { setNodeTags } from "./tags";

const DAY = 86_400_000;
const iso = (today: Date, offsetDays: number) =>
  new Date(Math.floor(today.getTime() / DAY) * DAY + offsetDays * DAY).toISOString();

interface TaskSpec {
  title: string;
  estimation: number;
  /** 0–100, or "done" */
  progress: number | "done";
  assignee: string | null;
  tag?: string;
  /** overrides the sprint window */
  window?: readonly [string, string];
}

/**
 * "New Product Launch": a project with Frontend/Backend epics and two sprints each, dated relative
 * to `today` so the demo always shows a mix of green, yellow and red. Used by the seed and by onboarding.
 *
 * Expected picture (for any `today`):
 *  - Frontend sprint 1 green · sprint 2 yellow · epic green
 *  - Backend sprint 1 red (overdue billing task) · sprint 2 red (lagging search + blocked task) · epic red
 *  - project red (one of two epics is red = 50% > 25%)
 */
export async function createDemoProject(
  userId: string,
  workspaceId: string,
  people: { a: string; b: string },
  today = new Date(),
): Promise<{ project: Node }> {
  const { project } = await createProject(userId, workspaceId, {
    name: "New Product Launch",
    description: "Demo project: ship the 1.0 release of the product.",
    startDate: iso(today, -30),
    dueDate: iso(today, 30),
    template: "empty",
  });

  const tagRows = await db.tag.findMany({ where: { workspaceId, name: { in: ["design", "api"] } } });
  const tags = new Map(tagRows.map((t) => [t.name, t.id]));
  for (const [name, color] of [["design", "#9333ea"], ["api", "#0891b2"]] as const) {
    if (!tags.has(name)) tags.set(name, (await db.tag.create({ data: { workspaceId, name, color } })).id);
  }

  const make = async (parentId: string, type: "EPIC" | "SPRINT", title: string, startDate: string, dueDate: string) =>
    (await transact(userId, (ctx) => createNode(ctx, { parentId, type, title, startDate, dueDate }))).result;

  const task = async (sprint: Node, spec: TaskSpec, sprintStart: string, sprintDue: string) => {
    const [startDate, dueDate] = spec.window ?? [sprintStart, sprintDue];
    const n = (
      await transact(userId, (ctx) =>
        createNode(ctx, { parentId: sprint.id, type: "TASK", title: spec.title, estimation: spec.estimation, assigneeId: spec.assignee, startDate, dueDate }),
      )
    ).result;
    if (spec.progress === "done") await transact(userId, (ctx) => patchNode(ctx, n.id, { status: "DONE" }));
    else if (spec.progress > 0) await transact(userId, (ctx) => patchNode(ctx, n.id, { status: "IN_PROGRESS", progress: spec.progress as number }));
    if (spec.tag && tags.get(spec.tag)) await setNodeTags(userId, n.id, [tags.get(spec.tag) as string]);
    return n;
  };

  const { a, b } = people;
  const s1 = [iso(today, -28), iso(today, -8)] as const;
  const s2 = [iso(today, -7), iso(today, 7)] as const;

  const frontend = await make(project.id, "EPIC", "Frontend", iso(today, -30), iso(today, 25));
  const fs1 = await make(frontend.id, "SPRINT", "Sprint 1", ...s1);
  const fs2 = await make(frontend.id, "SPRINT", "Sprint 2", ...s2);
  await task(fs1, { title: "Design system", estimation: 16, progress: "done", assignee: a, tag: "design" }, ...s1);
  await task(fs1, { title: "Landing page", estimation: 24, progress: "done", assignee: b, tag: "design" }, ...s1);
  await task(fs1, { title: "Login flow", estimation: 12, progress: "done", assignee: a }, ...s1);
  await task(fs2, { title: "Dashboard UI", estimation: 20, progress: 50, assignee: b, tag: "design" }, ...s2);
  await task(fs2, { title: "Settings page", estimation: 8, progress: 20, assignee: a }, ...s2);
  await task(fs2, { title: "Onboarding tour", estimation: 10, progress: 0, assignee: null, window: [iso(today, 0), iso(today, 14)] }, ...s2);

  const backend = await make(project.id, "EPIC", "Backend", iso(today, -30), iso(today, 25));
  const bs1 = await make(backend.id, "SPRINT", "Sprint 1", ...s1);
  const bs2 = await make(backend.id, "SPRINT", "Sprint 2", ...s2);
  await task(bs1, { title: "API v1", estimation: 16, progress: "done", assignee: b, tag: "api" }, ...s1);
  await task(bs1, { title: "Auth service", estimation: 12, progress: "done", assignee: a, tag: "api" }, ...s1);
  const billing = await task(bs1, { title: "Billing webhooks", estimation: 10, progress: 60, assignee: b, tag: "api" }, ...s1);
  await task(bs2, { title: "Search API", estimation: 16, progress: 10, assignee: a, tag: "api" }, ...s2);
  await task(bs2, { title: "Notifications", estimation: 8, progress: 40, assignee: b }, ...s2);
  const rate = await task(bs2, { title: "Rate limiting", estimation: 4, progress: 50, assignee: a, tag: "api" }, ...s2);

  await transact(userId, (ctx) => createLink(ctx, { fromNodeId: billing.id, toNodeId: rate.id, kind: "BLOCKS" }));
  await transact(userId, (ctx) =>
    createNode(ctx, {
      parentId: project.id,
      type: "DOCUMENT",
      title: "Launch plan",
      data: { kind: "spec", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Goal: ship 1.0 and onboard the first ten customers." }] }] } },
    }),
  );
  await transact(userId, (ctx) =>
    createNode(ctx, {
      parentId: fs2.id,
      type: "EVENT",
      title: "Sprint 2 review",
      data: { startsAt: iso(today, 7).replace(/T.*/, "T14:00:00.000Z"), agenda: "Demo the dashboard and settings." },
    }),
  );
  return { project };
}
