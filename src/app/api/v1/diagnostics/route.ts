import { dbRegionOf, regionVerdict } from "@/lib/db-region";
import { db } from "@/server/db";
import { route } from "@/server/http/handler";

/**
 * For a signed-in person who asks why the app is slow: where the database is, where the server runs, and how long a trip to the database takes.
 * Only region names and times; no addresses or secrets.
 */
export const GET = route({}, async () => {
  const t0 = performance.now();
  await db.$queryRaw`SELECT 1`;
  const first = Math.round(performance.now() - t0);
  const t1 = performance.now();
  await db.$queryRaw`SELECT 1`;
  const second = Math.round(performance.now() - t1);
  const dbRegion = dbRegionOf(process.env.DATABASE_URL);
  const functionRegion = process.env.VERCEL_REGION;
  return { dbRegion, functionRegion: functionRegion ?? "unknown", regionsClose: regionVerdict(dbRegion, functionRegion), tripToDatabaseMs: second, firstTripMs: first };
});
