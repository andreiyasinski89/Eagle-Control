/** The fields of a person's profile and how they are cleaned; pure, so the form and the server say the same thing. */

export const TELEGRAM_RE = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;

/** "@name", "name", "t.me/name", "https://t.me/name?start=x" all mean the user name `name`; anything else is null. */
export function normalizeTelegram(input: string): string | null {
  let v = input.trim();
  if (!v) return null;
  v = v.replace(/^https?:\/\//i, "").replace(/^(www\.)?(t|telegram)\.me\//i, "").replace(/^@/, "");
  v = v.split(/[/?#]/)[0] ?? "";
  return TELEGRAM_RE.test(v) ? v : null;
}

export const telegramUrl = (username: string) => `https://t.me/${username}`;

/** Digits with an optional leading +, spaces, dashes, dots and brackets allowed in between; 6 to 15 digits. Returns the text tidied, or null. */
export function normalizePhone(input: string): string | null {
  const v = input.trim().replace(/\s+/g, " ");
  if (!/^\+?[\d\s().-]+$/.test(v)) return null;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15 ? v : null;
}

/** The display name: first and last name joined, or null when neither is given. */
export function displayName(first: string | null | undefined, last: string | null | undefined): string | null {
  const n = [first, last].map((x) => x?.trim()).filter(Boolean).join(" ");
  return n || null;
}

/** Up to two capital letters for a round avatar: first and last name, else the first two letters of the name or the e-mail. */
export function initialsOf(name: string | null | undefined, email: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? `${words[0]?.[0] ?? ""}${words[words.length - 1]?.[0] ?? ""}` : (words[0] ?? email).slice(0, 2);
  return letters.toUpperCase();
}
