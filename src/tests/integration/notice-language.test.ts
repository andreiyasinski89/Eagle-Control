import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn() }));
vi.mock("@/server/realtime", () => ({ publishNotification: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { notify } from "@/server/services/notify";

let close: () => Promise<void>;
let raw: PrismaClient;

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
}, 120_000);
afterAll(async () => close?.());

describe("a notice is stored in the language its reader uses", () => {
  it("Russian for a Russian reader, English for an English one, from the same call", async () => {
    const ru = (await raw.user.create({ data: { email: "ru@x.io", name: "Ru", locale: "ru" } })).id;
    const en = (await raw.user.create({ data: { email: "en@x.io", name: "En", locale: "en" } })).id;
    const ws = await createWorkspace(ru, "W");
    const send = (userId: string) => notify({ userId, workspaceId: ws.id, kind: "deal_won", title: "Deal won: Big", body: "100 EUR", text: { key: "dealWon", params: { title: "Big" } } });
    const a = await send(ru);
    const b = await send(en);
    const payload = async (id: string | null) => (await raw.notification.findUniqueOrThrow({ where: { id: id as string } })).payload as { title: string; body: string };
    expect(await payload(a)).toMatchObject({ title: "Сделка выиграна: Big", body: "100 EUR" });
    expect(await payload(b)).toMatchObject({ title: "Deal won: Big", body: "100 EUR" });
  });
});
