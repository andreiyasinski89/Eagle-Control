import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ru", "pl", "uk"],
  defaultLocale: "en",
  // Ukrainian is "uk" for browsers and for dates and numbers, but the address and the switcher use the country letters people know: /ua.
  localePrefix: { mode: "as-needed", prefixes: { uk: "/ua" } },
});

export type Locale = (typeof routing.locales)[number];
