import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn(async () => undefined) }));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { createNode, createProject, patchNode, transact } from "@/server/services/nodes/ops";
import { getTree } from "@/server/services/nodes/queries";
import { createComment } from "@/server/services/comments";
import { createDeal, moveDeal } from "@/server/services/crm/deals";
import { listPipelines } from "@/server/services/crm/pipelines";
import { notify } from "@/server/services/notify";
import { authorizeRooms } from "@/server/realtime/access";
import { boardRoom, colorFor, connections, listPresence, memoryTransportForTests, PRESENCE_TTL_MS, projectRoom, publish, publishTree, removePresence, setPresence, userRoom, type RealtimeEvent } from "@/server/realtime";

let close: () => Promise<void>;
let owner: string;
let plain: string;
let outsider: string;
let ws: { id: string; slug: string };
let projectId: string;
let sprintId: string;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function listen(room: string): { events: RealtimeEvent[]; off: () => void } {
  const events: RealtimeEvent[] = [];
  const off = memoryTransportForTests().subscribe(room, (_r, e) => events.push(e));
  return { events, off };
}

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://x";
  process.env.AUTH_SECRET ??= "x";
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  plain = (await t.db.user.create({ data: { email: "m@x.io", name: "Plain" } })).id;
  outsider = (await t.db.user.create({ data: { email: "z@x.io" } })).id;
  ws = await createWorkspace(owner, "Live");
  await t.db.membership.create({ data: { userId: plain, workspaceId: ws.id, role: "MEMBER", crmAccess: false } });
  const { project } = await createProject(owner, ws.id, { name: "Shared", template: "agile-sprint-map" });
  projectId = project.id;
  sprintId = (await getTree(owner, projectId)).nodes.find((n) => n.type === "SPRINT")!.id;
}, 120_000);
afterAll(async () => close?.());

describe("bus", () => {
  it("delivers to subscribers of a room only, stops after unsubscribe and survives a failing handler", () => {
    const bus = memoryTransportForTests();
    const a = listen("room:a");
    const b = listen("room:b");
    const off = bus.subscribe("room:a", () => {
      throw new Error("boom");
    });
    publish("room:a", { type: "notification" });
    expect(a.events).toHaveLength(1);
    expect(b.events).toHaveLength(0);
    a.off();
    off();
    b.off();
    publish("room:a", { type: "notification" });
    expect(a.events).toHaveLength(1);
    expect(bus.subscriberCount("room:a")).toBe(0);
  });

  it("announces each project once however many changes it saw", () => {
    const l = listen(projectRoom("p1"));
    publishTree(["p1", "p1", "p1"], "u1");
    expect(l.events).toEqual([{ type: "tree.changed", projectId: "p1", actorId: "u1" }]);
    l.off();
  });
});

describe("presence", () => {
  const me = { connId: "c1", userId: "u1", name: "Ann", selectedNodeId: null, editingNodeId: null, cursor: null };
  it("tracks people per room, announces changes and forgets people who leave", () => {
    const l = listen("project:presence");
    setPresence("project:presence", me, 1_000);
    setPresence("project:presence", { ...me, selectedNodeId: "n1", cursor: { x: 1, y: 2 } }, 2_000);
    setPresence("project:presence", { ...me, connId: "c2", userId: "u2", name: "Bob" }, 2_000);
    expect(listPresence("project:presence", 3_000).map((u) => [u.connId, u.selectedNodeId])).toEqual([["c1", "n1"], ["c2", null]]);
    removePresence("project:presence", "c1");
    expect(listPresence("project:presence", 3_000).map((u) => u.connId)).toEqual(["c2"]);
    expect(l.events.map((e) => e.type)).toEqual(["presence", "presence", "presence", "presence.leave"]);
    l.off();
    removePresence("project:presence", "c2");
  });

  it("lets quiet connections expire and gives a person one stable colour", () => {
    setPresence("project:ttl", me, 1_000);
    expect(listPresence("project:ttl", 1_000 + PRESENCE_TTL_MS - 1)).toHaveLength(1);
    expect(listPresence("project:ttl", 1_000 + PRESENCE_TTL_MS + 1)).toHaveLength(0);
    expect(colorFor("u1")).toBe(colorFor("u1"));
    expect(colorFor("u1")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("room authorisation", () => {
  it("opens a project to its workspace, the board to CRM people and the user room to its owner", async () => {
    const got = await authorizeRooms(plain, ["user", `project:${projectId}`, `board:${ws.id}`]);
    expect([...got.keys()]).toEqual(["user", `project:${projectId}`]); // plain has no CRM access
    expect(got.get("user")).toBe(userRoom(plain));
    expect((await authorizeRooms(owner, [`board:${ws.id}`])).get(`board:${ws.id}`)).toBe(boardRoom(ws.id));
  });

  it("gives strangers nothing, ignores junk and caps the number of rooms", async () => {
    expect((await authorizeRooms(outsider, [`project:${projectId}`, `board:${ws.id}`, "project:nope", "weird", "user:someone-else"])).size).toBe(0);
    const many = await authorizeRooms(owner, ["user", ...Array.from({ length: 20 }, (_, i) => `project:x${i}`)]);
    expect(many.size).toBe(1);
  });

  it("only lets a connection speak for itself", () => {
    expect(connections.get("nope")).toBeUndefined();
  });
});

describe("what gets announced", () => {
  it("tells a project's room after a committed change, not before and not for a failed one", async () => {
    const l = listen(projectRoom(projectId));
    const created = (await transact(owner, (ctx) => createNode(ctx, { parentId: sprintId, type: "TASK", title: "Live task" }))).result;
    expect(l.events).toEqual([{ type: "tree.changed", projectId, actorId: owner }]);
    await transact(owner, (ctx) => patchNode(ctx, created.id, { title: "Renamed" }));
    expect(l.events).toHaveLength(2);
    await expect(transact(owner, async () => Promise.reject(new Error("rolled back")))).rejects.toThrow();
    expect(l.events).toHaveLength(2);
    l.off();
  });

  it("announces comments, board moves and notifications shortly after they are written", async () => {
    const project = listen(projectRoom(projectId));
    const board = listen(boardRoom(ws.id));
    const mine = listen(userRoom(plain));
    await createComment(owner, sprintId, { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }] }, mentions: [plain], parentCommentId: null });
    const pipeline = (await listPipelines(owner, ws.id))[0]!;
    const deal = await createDeal(owner, ws.id, { title: "Hot", amount: 1, currency: "EUR" });
    await moveDeal(owner, deal.id, { stageId: pipeline.stages[1]!.id });
    await notify({ userId: plain, workspaceId: ws.id, kind: "reminder", title: "Ping" });
    await wait(450);
    expect(project.events.some((e) => e.type === "comment.added" && e.nodeId === sprintId)).toBe(true);
    expect(board.events.filter((e) => e.type === "board.changed").length).toBeGreaterThanOrEqual(2);
    expect(mine.events.filter((e) => e.type === "notification").length).toBeGreaterThanOrEqual(2); // the mention and the ping
    project.off();
    board.off();
    mine.off();
  });
});
