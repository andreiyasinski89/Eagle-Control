/**
 * Who is signed in, without mistaking a database hiccup for a sign-out.
 *
 * Auth.js answers "nobody" when the lookup of the session fails (the database slept, a connection timed out), exactly as it does for a person who
 * is really signed out. The page then sends a person who IS signed in back to the sign-in page, they ask for a new link, and it can repeat for as
 * long as the database is slow. So an answer of "nobody" is believed only when there is no session cookie, or the database confirms that the
 * session is not there (or is out of date). Otherwise the lookup is repeated, and when it still fails the request fails honestly instead of signing anyone out.
 */
export interface SessionSource<S> {
  /** Auth.js's own answer. */
  read(): Promise<S | null>;
  /** The session cookie the browser sent, if any. */
  token(): Promise<string | null>;
  /** Whether the database knows this session and it has not expired. Throws when the database does not answer. */
  valid(token: string): Promise<boolean>;
}

export async function resilientSession<S extends { user?: unknown }>(src: SessionSource<S>, waits: readonly number[] = [300, 900, 2000], sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<S | null> {
  for (let attempt = 0; ; attempt++) {
    const s = await src.read();
    if (s?.user) return s;
    const token = await src.token();
    if (!token) return null;
    // Cannot tell (the database does not answer): the person is more likely signed in than not, so do not sign them out.
    const known = await src.valid(token).catch(() => true);
    if (!known) return null;
    const wait = waits[attempt];
    if (wait === undefined) throw new Error("The session exists but could not be read: the database is not answering");
    console.warn(`[auth] session lookup failed, trying again in ${wait} ms (${attempt + 1}/${waits.length})`);
    await sleep(wait);
  }
}
