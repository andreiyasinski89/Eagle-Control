import { after } from "next/server";

/**
 * Work that must not hold up the answer to the person but must still finish. With Next's `after` the host (Vercel) keeps the function alive until it
 * is done; a bare `void promise` is simply cut off once the answer has gone, which on a serverless host loses it. Where there is no request
 * (scripts, tests) `after` throws and the work starts right away.
 */
export function afterResponse(work: () => Promise<unknown>): void {
  try {
    after(work);
  } catch {
    void work();
  }
}
