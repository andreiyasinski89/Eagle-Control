"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

// The language code of Ukrainian is "uk" (what browsers send), but the address and the switcher use the country letters people know: UA.
const LABEL: Partial<Record<Locale, string>> = { uk: "UA" };

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <select
      aria-label="Language"
      value={locale}
      onChange={(e) => router.replace(pathname, { locale: e.target.value as Locale })}
      className="h-8 rounded-md border border-border bg-card px-2 text-sm"
    >
      {routing.locales.map((l) => (
        <option key={l} value={l}>
          {LABEL[l] ?? l.toUpperCase()}
        </option>
      ))}
    </select>
  );
}
