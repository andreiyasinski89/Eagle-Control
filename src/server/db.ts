import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Timing of the queries, for finding what makes a page slow: `DB_LOG_QUERIES=1` writes every query with its time,
 * `DB_SLOW_MS=300` writes only those that take at least that long (it is safe to leave on in production, the log is then short).
 * Without either nothing is listened to and nothing is slowed down.
 */
function create(): PrismaClient {
  const all = process.env.DB_LOG_QUERIES === "1";
  const slow = Number(process.env.DB_SLOW_MS ?? "");
  if (!all && !(slow > 0)) return new PrismaClient();
  const client = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
  (client as unknown as { $on(event: "query", cb: (e: { query: string; duration: number }) => void): void }).$on("query", (e) => {
    if (all || e.duration >= slow) console.log(`[db] ${e.duration} ms ${e.query.replace(/\s+/g, " ").slice(0, 160)}`);
  });
  return client;
}

export const db = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
