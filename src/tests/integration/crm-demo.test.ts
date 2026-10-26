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
import { createDemoCrm } from "@/server/services/demo-crm";
import { createWorkspace } from "@/server/services/workspace";
import { getClientMap } from "@/server/services/crm/client-map";
import { listCompanies } from "@/server/services/crm/companies";
import { getBoard } from "@/server/services/crm/deals";
import { listPipelines } from "@/server/services/crm/pipelines";
import { getMyDay } from "@/server/services/crm/my-day";

let close: () => Promise<void>;
let owner: string;
let member: string;
let wsId: string;

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "a@x.io", name: "A" } })).id;
  member = (await t.db.user.create({ data: { email: "b@x.io", name: "B" } })).id;
  const ws = await createWorkspace(owner, "Demo");
  wsId = ws.id;
  await t.db.membership.create({ data: { userId: member, workspaceId: ws.id, role: "MEMBER", crmAccess: true } });
  const { project } = await createDemoProject(owner, ws.id, { a: owner, b: member });
  await createDemoCrm(owner, ws.id, { a: owner, b: member }, project.id);
}, 180_000);

afterAll(async () => close?.());

describe("demo CRM", () => {
  it("fills every pipeline stage state with believable data", async () => {
    const [pipeline] = await listPipelines(owner, wsId);
    const board = await getBoard(owner, pipeline!.id, {});
    const col = (name: string) => board.columns.find((c) => c.name === name)!;
    expect(col("Won").deals.map((d) => d.title)).toEqual(["Brightly — Product launch"]);
    expect(col("Lost").deals).toHaveLength(1);
    expect(col("Negotiation").deals[0]).toMatchObject({ title: "Nordwind — Mobile app", health: "RED", currency: "USD" });
    expect(col("Qualification").deals[0]).toMatchObject({ title: "Nordwind — Website redesign", health: "YELLOW", nextStep: null });
    expect(col("Proposal").deals[0]?.health).toBe("GREEN");
    expect(col("Won").totals.byCurrency.EUR?.amount).toBe(24000);
  });

  it("Brightly's Client Map carries the red demo project and flags the client", async () => {
    const companies = await listCompanies(owner, wsId, { sort: "legalName", dir: "asc", page: 1, pageSize: 10 });
    expect(companies.items.map((c) => c.legalName)).toEqual(["Brightly", "Kowalski & Co", "Nordwind GmbH"]);
    const brightly = companies.items.find((c) => c.legalName === "Brightly")!;
    expect(brightly).toMatchObject({ lifecycleStage: "CUSTOMER", projectHealth: "RED", revenue: { EUR: 24000 } });
    const map = await getClientMap(owner, brightly.id);
    expect(map.atRisk).toBe(true);
    expect(map.nodes.some((n) => n.type === "PROJECT" && n.linked && n.title === "New Product Launch")).toBe(true);
    expect(map.nodes.filter((n) => n.type === "TASK").length).toBe(12);
  });

  it("My Day shows the neglected deal, the overdue task and the cold contact", async () => {
    const d = await getMyDay(member, wsId);
    expect(d.crm).toBe(true);
    if (!d.crm) return;
    expect(d.crmTasks.map((t) => t.subject)).toContain("Prepare the contract draft");
    expect(d.attention.staleDeals.map((x) => x.title)).toContain("Nordwind — Mobile app");
    expect(d.attention.coldContacts.map((c) => c.name)).toContain("Piotr Nowak");
  });
});
