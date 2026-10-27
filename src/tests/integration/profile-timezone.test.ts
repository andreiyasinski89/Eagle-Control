import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient, userId: null as string | null }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/auth", () => ({ auth: async () => (holder.userId ? { user: { id: holder.userId } } : null) }));

import { GET, PATCH } from "@/app/api/v1/me/route";

let close: () => Promise<void>;
const none = { params: Promise.resolve({}) };
const patch = (body: unknown) => PATCH(new NextRequest("http://localhost/api/v1/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), none);

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  holder.userId = (await t.db.user.create({ data: { email: "p@x.io", name: "P" } })).id;
}, 120_000);
afterAll(async () => close?.());

describe("profile time zone", () => {
  it("starts on UTC", async () => {
    expect(await (await GET(new NextRequest("http://localhost/api/v1/me"), none)).json()).toMatchObject({ timezone: "UTC" });
  });
  it("saves a real zone for the person who asks", async () => {
    const res = await patch({ timezone: "Europe/Paris" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ timezone: "Europe/Paris" });
    expect((await holder.db.user.findUniqueOrThrow({ where: { id: holder.userId as string } })).timezone).toBe("Europe/Paris");
  });
  it("refuses a zone that does not exist and leaves the saved one alone", async () => {
    for (const timezone of ["Mars/Olympus", "", "Paris"]) expect((await patch({ timezone })).status, timezone).toBe(400);
    expect((await holder.db.user.findUniqueOrThrow({ where: { id: holder.userId as string } })).timezone).toBe("Europe/Paris");
  });
  it("needs a signed-in person", async () => {
    const was = holder.userId;
    holder.userId = null;
    expect((await patch({ timezone: "UTC" })).status).toBe(401);
    holder.userId = was;
  });
});
