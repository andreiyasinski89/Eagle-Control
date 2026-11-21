/** The only database error codes that are told to the outside, so that "the database is down" says which way: no address, no message, nothing else. */
const REASONS: Record<string, string> = {
  P1000: "login_refused", // the database refused the name/password
  P1001: "unreachable", // the server cannot be reached (stopped, suspended, over its quota, network)
  P1002: "timeout", // reached, but did not answer in time
  P1008: "timeout",
  P1017: "closed", // the server closed the connection
  P2024: "pool_timeout", // no free connection in the pool within the time
};

export function healthReason(e: unknown): string {
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  return REASONS[code] ?? "other";
}
