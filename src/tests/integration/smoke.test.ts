import { describe, expect, it } from "vitest";
import { createTestDb } from "./pg";

describe("pglite", () => {
  it("applies migrations and round-trips a row", async () => {
    const { db, close } = await createTestDb();
    const u = await db.user.create({ data: { email: "a@b.c" } });
    expect((await db.user.findUnique({ where: { id: u.id } }))?.email).toBe("a@b.c");
    await close();
  }, 60_000);
});
