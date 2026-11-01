/**
 * A database that sleeps when nobody uses it (the free hosted ones do) answers the first query after a pause with "can't reach the server"
 * and the next ones fine. Without a retry the person who happens to come first sees a crash page, or a button that works only the second time.
 * Only the errors that mean "the connection was not there" are retried: a query that really ran and failed is never run twice.
 */
const TRANSIENT = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);

/** The library engine often reports an unreachable server with no code at all, only the words. */
const UNREACHABLE = /Can't reach database server|Timed out fetching a new connection|Server has closed the connection|Connection terminated unexpectedly/i;

export function isTransientDbError(e: unknown): boolean {
  const o = (e ?? {}) as { code?: unknown; errorCode?: unknown; message?: unknown };
  const code = typeof o.code === "string" ? o.code : typeof o.errorCode === "string" ? o.errorCode : "";
  return TRANSIENT.has(code) || (typeof o.message === "string" && UNREACHABLE.test(o.message));
}

/** Runs the query again, after a short wait each time, while the error is a missing connection. */
export async function withDbRetry<T>(run: () => Promise<T>, waits: readonly number[] = [400, 1200, 2500], sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      const wait = waits[attempt];
      if (wait === undefined || !isTransientDbError(e)) throw e;
      console.warn(`[db] connection not ready, retrying in ${wait} ms (${attempt + 1}/${waits.length})`);
      await sleep(wait);
    }
  }
}
