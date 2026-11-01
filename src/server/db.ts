import { PrismaClient } from "@prisma/client";
import { withDbRetry } from "./db-retry";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Timing of the queries, for finding what makes a page slow: `DB_LOG_QUERIES=1` writes every query with its time,
 * `DB_SLOW_MS=300` writes only those that take at least that long (it is safe to leave on in production, the log is then short).
 * Without either nothing is listened to and nothing is slowed down.
 */
function create(): PrismaClient {
  const all = process.env.DB_LOG_QUERIES === "1";
  const slow = Number(process.env.DB_SLOW_MS ?? "");
  const listening = all || slow > 0;
  const client = listening ? new PrismaClient({ log: [{ emit: "event", level: "query" }] }) : new PrismaClient();
  if (listening) {
    (client as unknown as { $on(event: "query", cb: (e: { query: string; duration: number }) => void): void }).$on("query", (e) => {
      if (all || e.duration >= slow) console.log(`[db] ${e.duration} ms ${e.query.replace(/\s+/g, " ").slice(0, 160)}`);
    });
  }
  // A sleeping database answers the first query after a pause with "can't reach the server": that query is tried again (see db-retry.ts).
  // The type stays the plain client: the extension changes how queries run, not what they are.
  return client.$extends({ query: { $allOperations: ({ args, query }) => withDbRetry(() => query(args)) } }) as unknown as PrismaClient;
}

export const db = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
