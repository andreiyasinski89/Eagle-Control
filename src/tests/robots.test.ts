import { describe, expect, it } from "vitest";
import robots from "@/app/robots";

describe("robots.txt", () => {
  const rule = (robots().rules as { userAgent: string; allow: string; disallow: string[] }[])[0]!;

  it("lets crawlers read the public pages and closes the API, the personal and the signed-in areas, with and without a language prefix", () => {
    expect(rule).toMatchObject({ userAgent: "*", allow: "/" });
    for (const closed of ["/api/", "/f/", "/w/", "/*/w/", "/admin", "/*/admin$", "/account", "/onboarding", "/*/portal/", "/invite/", "/*/oauth/", "/r/", "/*/i/"]) expect(rule.disallow, closed).toContain(closed);
  });

  it("does not close the pages a search engine may show", () => {
    for (const open of ["/sign-in", "/legal/terms", "/ru/legal/privacy"]) expect(rule.disallow.some((d) => d === open), open).toBe(false);
  });
});
