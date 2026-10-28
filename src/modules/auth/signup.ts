/** Pure rules for creating an account: what an address may be, what a name may be, what an invitation code looks like. */

/** Mailboxes that anyone can open without an account, used to make throw-away accounts. Not exhaustive; the daily limits are the other guard. */
export const DISPOSABLE_DOMAINS: readonly string[] = [
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamail.biz", "sharklasers.com", "grr.la", "guerrillamailblock.com",
  "10minutemail.com", "10minutemail.net", "10minutemail.org", "20minutemail.com", "tempmail.com", "temp-mail.org", "temp-mail.io", "tempmailo.com", "tempail.com",
  "throwawaymail.com", "yopmail.com", "yopmail.net", "yopmail.fr", "trashmail.com", "trashmail.net", "trashmail.de", "getnada.com", "nada.email", "dispostable.com",
  "maildrop.cc", "mailnesia.com", "mailcatch.com", "mintemail.com", "mohmal.com", "moakt.com", "mytemp.email", "fakeinbox.com", "fakemail.net", "emailondeck.com",
  "burnermail.io", "spamgourmet.com", "spam4.me", "mailtemp.net", "tempinbox.com", "inboxkitten.com", "discard.email", "discardmail.com", "dropmail.me", "emailfake.com",
  "fakemailgenerator.com", "harakirimail.com", "incognitomail.com", "jetable.org", "mailforspam.com", "mailsac.com", "mvrht.com", "my10minutemail.com", "owlymail.com",
  "puremail.org", "sneakemail.com", "spambox.us", "tempr.email", "tmail.ws", "tmpmail.org", "tmpmail.net", "trbvm.com", "vomoto.com", "wegwerfmail.de", "wegwerfmail.net",
  "xoxy.net", "zetmail.com", "33mail.com", "anonbox.net", "armyspy.com", "cuvox.de", "dayrep.com", "einrot.com", "fleckens.hu", "gustr.com", "jourrapide.com", "rhyta.com",
  "superrito.com", "teleworm.us", "mail.tm", "internxt.com", "1secmail.com", "1secmail.net", "1secmail.org", "esiix.com", "wwjmp.com", "icznn.com", "vjuum.com",
];

const DISPOSABLE = new Set(DISPOSABLE_DOMAINS);

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@").pop() ?? "";
}

/** A throw-away mailbox: the domain is on the list, or is a subdomain of one that is. */
export function isDisposableEmail(email: string): boolean {
  const d = emailDomain(email);
  if (!d) return false;
  if (DISPOSABLE.has(d)) return true;
  const parts = d.split(".");
  for (let i = 1; i < parts.length - 1; i++) if (DISPOSABLE.has(parts.slice(i).join("."))) return true;
  return false;
}

/** An invitation code: lower-case letters and digits, 8 to 16 of them. */
export const REF_CODE_RE = /^[a-z0-9]{8,16}$/;
export const isRefCode = (v: unknown): v is string => typeof v === "string" && REF_CODE_RE.test(v);

/** The code is read from what was typed or pasted: a bare code, or a link ending in /r/<code>. */
export function parseRefCode(input: string | null | undefined): string | null {
  const v = (input ?? "").trim().toLowerCase();
  const m = /\/r\/([a-z0-9]{8,16})\/?(?:[?#].*)?$/.exec(v);
  const code = m?.[1] ?? v;
  return isRefCode(code) ? code : null;
}

/** First and last name as typed: tidied, at most 60 characters; empty becomes null. */
export function cleanName(v: string | null | undefined): string | null {
  const s = (v ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  return s || null;
}

export type SignupLocale = "en" | "ru" | "pl" | "uk";
export const isSignupLocale = (v: unknown): v is SignupLocale => v === "en" || v === "ru" || v === "pl" || v === "uk";
