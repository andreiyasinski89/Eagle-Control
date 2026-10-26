/** Normalisers used for duplicate detection. All return null when nothing usable is left. */

export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

/**
 * Phones are compared by their last 9 digits, so "+48 600 123 456", "600-123-456" and
 * "0048600123456" are the same number. Anything shorter than 7 digits is not a phone.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D+/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-9);
}

/** Host of a website or e-mail domain, without scheme, `www.`, path or port. */
export function normalizeDomain(raw: string | null | undefined): string | null {
  let v = (raw ?? "").trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^.*@/, "");
  v = (v.split(/[/?#]/)[0] ?? "").replace(/:\d+$/, "").replace(/^www\./, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v) ? v : null;
}

const LEGAL_SUFFIXES = [
  "sp. z o.o.",
  "sp z oo",
  "spolka z ograniczona odpowiedzialnoscia",
  "s.a.",
  "llc",
  "ltd",
  "inc",
  "gmbh",
  "ooo",
  "ооо",
  "оао",
  "зао",
  "ип",
];

/** Company name reduced to something comparable: no case, punctuation, diacritics or legal form. */
export function normalizeCompanyName(raw: string | null | undefined): string | null {
  let v = (raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l");
  for (const s of LEGAL_SUFFIXES) {
    const suffix = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    v = v.replace(new RegExp(`(^|\\s)${suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "g"), " ");
  }
  v = v.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return v.length >= 2 ? v : null;
}

export function uniqueNonNull<T>(items: readonly (T | null | undefined)[]): T[] {
  return [...new Set(items.filter((x): x is T => x !== null && x !== undefined))];
}
