/**
 * Auth.js turns anything thrown while sending the sign-in e-mail into a bare "Configuration" error, and the person at the form would only be told
 * "check the address". The sender notes here why it failed, and the route that answers the form reads it a moment later (same request, same process),
 * so the person is told the truth: the mail service is not working, and it is not their fault.
 */
const failed = new Map<string, { kind: string; at: number }>();
const TTL = 60_000;

export function noteSignInMailFailure(email: string, kind: string, now = Date.now()): void {
  for (const [k, v] of failed) if (now - v.at > TTL) failed.delete(k);
  failed.set(email.trim().toLowerCase(), { kind, at: now });
}

/** The kind of failure noted for this address in the last minute, once. */
export function takeSignInMailFailure(email: string, now = Date.now()): string | null {
  const key = email.trim().toLowerCase();
  const v = failed.get(key);
  failed.delete(key);
  return v && now - v.at <= TTL ? v.kind : null;
}
