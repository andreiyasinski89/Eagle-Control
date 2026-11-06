export function money(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** "€12,000 · $500" for a per-currency breakdown, biggest first. */
export function moneyLines(byCurrency: Record<string, number>, locale: string): string {
  return Object.entries(byCurrency)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => money(v, c, locale))
    .join(" · ");
}

export function shortDate(iso: string | null, locale: string): string {
  return iso ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso)) : "";
}

export function dayInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export const dayToIso = (v: string): string | null => (v ? `${v}T00:00:00.000Z` : null);

export function initials(name: string | null | undefined, email?: string): string {
  const src = name ?? email ?? "?";
  return src
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export function relativeDays(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

const dayKey = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/**
 * A moment as people say it, in the person's own time zone and without seconds: "today, 23:11", "yesterday, 09:05",
 * "6 Nov, 23:11", and with the year only when it is not this year. "Today" and "yesterday" come from the browser in the page's language.
 */
export function whenLabel(iso: string | Date, locale: string, tz: string, now = new Date()): string {
  const d = new Date(iso);
  let zone = tz;
  try {
    new Intl.DateTimeFormat(locale, { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: zone }).format(d);
  const k = dayKey(d, zone);
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (k === dayKey(now, zone) || k === dayKey(yesterday, zone)) {
    const word = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(k === dayKey(now, zone) ? 0 : -1, "day");
    return `${word}, ${time}`;
  }
  const sameYear = k.slice(0, 4) === dayKey(now, zone).slice(0, 4);
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: zone }).format(d);
  return `${day}, ${time}`;
}
