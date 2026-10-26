import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "@prisma/client";

/** In-memory Postgres with the real migrations applied, wrapped in a Prisma client. */
export async function createTestDb(): Promise<{ db: PrismaClient; close: () => Promise<void> }> {
  const pg = new PGlite();
  const dir = path.resolve(process.cwd(), "prisma/migrations");
  for (const name of readdirSync(dir).filter((n) => /^\d{4}_/.test(n)).sort()) {
    await pg.exec(readFileSync(path.join(dir, name, "migration.sql"), "utf8"));
  }
  // pglite-prisma-adapter bundles its own copy of the driver-adapter types; they are structurally identical.
  type Adapter = NonNullable<ConstructorParameters<typeof PrismaClient>[0]>["adapter"];
  const db = new PrismaClient({ adapter: new PrismaPGlite(pg) as unknown as Adapter });
  return { db, close: async () => { await db.$disconnect(); await pg.close(); } };
}
