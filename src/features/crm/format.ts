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
