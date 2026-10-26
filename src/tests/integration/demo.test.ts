import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));

import { createDemoProject } from "@/server/services/demo";
import { getTree } from "@/server/services/nodes/queries";
import { createWorkspace } from "@/server/services/workspace";

let close: () => Promise<void>;

afterAll(async () => close?.());

describe("New Product Launch demo project", () => {
  const today = new Date();
  let byTitle: (title: string, parent?: string) => { progress: number; health: string; status: string };
  let count = 0;

  beforeAll(async () => {
    const t = await createTestDb();
    holder.db = t.db;
    close = t.close;
    const a = (await t.db.user.create({ data: { email: "a@x.io", name: "A" } })).id;
    const b = (await t.db.user.create({ data: { email: "b@x.io", name: "B" } })).id;
    const ws = await createWorkspace(a, "Demo");
    await t.db.membership.create({ data: { userId: b, workspaceId: ws.id, role: "MEMBER" } });
    const { project } = await createDemoProject(a, ws.id, { a, b }, today);
    const tree = await getTree(a, project.id, today);
    count = tree.nodes.length;
    byTitle = (title, parent) => {
      const matches = tree.nodes.filter((n) => n.title === title);
      const parentId = parent ? tree.nodes.find((e) => e.title === parent)?.id : undefined;
      const hit = parent ? matches.find((n) => n.parentId === parentId) : matches[0];
      if (!hit) throw new Error(`missing ${title}`);
      return hit;
    };
  }, 120_000);

  it("has the expected structure", () => {
    // project + 2 epics + 4 sprints + 12 tasks + 1 document + 1 event
    expect(count).toBe(21);
  });

  it("frontend is on track: sprint 1 done, sprint 2 at risk", () => {
    expect(byTitle("Frontend")).toMatchObject({ progress: 71, health: "GREEN" });
    expect(byTitle("Sprint 1", "Frontend")).toMatchObject({ progress: 100, health: "GREEN" });
    expect(byTitle("Sprint 2", "Frontend")).toMatchObject({ progress: 31, health: "YELLOW" });
    expect(byTitle("Dashboard UI").health).toBe("GREEN");
    expect(byTitle("Settings page").health).toBe("YELLOW"); // lag of exactly 30 points
    expect(byTitle("Onboarding tour").health).toBe("YELLOW"); // no assignee
  });

  it("backend is critical: overdue billing, lagging search, blocked rate limiting", () => {
    expect(byTitle("Backend")).toMatchObject({ progress: 61, health: "RED" });
    expect(byTitle("Sprint 1", "Backend")).toMatchObject({ progress: 89, health: "RED" });
    expect(byTitle("Sprint 2", "Backend")).toMatchObject({ progress: 24, health: "RED" });
    expect(byTitle("Billing webhooks").health).toBe("RED"); // overdue
    expect(byTitle("Search API").health).toBe("RED"); // 40 points behind
    expect(byTitle("Rate limiting").health).toBe("RED"); // blocked by billing
    expect(byTitle("Notifications").health).toBe("YELLOW"); // 10 points behind
  });

  it("rolls up to a red project (one of two epics red)", () => {
    expect(byTitle("New Product Launch")).toMatchObject({ progress: 67, health: "RED" });
  });
});
