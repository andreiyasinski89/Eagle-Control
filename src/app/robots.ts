import type { MetadataRoute } from "next";

/**
 * What search engines may read: the sign-in and legal pages. Everything behind a sign-in, the API, the one-time and personal links are closed to them.
 * Pages carry a language prefix (/ru/..., /ua/...), so each closed path is written with and without it.
 */
const CLOSED = ["w", "admin", "account", "onboarding", "portal", "invite", "oauth", "r", "i"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/f/", "/m/", ...CLOSED.flatMap((p) => [`/${p}/`, `/*/${p}/`, `/${p}`, `/*/${p}$`])] }],
  };
}
