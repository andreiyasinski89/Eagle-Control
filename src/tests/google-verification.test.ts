import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("what Google's app verification checks", () => {
  it("the privacy policy says what is done with Google user data and carries the Limited Use statement", () => {
    const p = read("src/app/[locale]/legal/privacy/page.tsx");
    expect(p).toContain("Google user data");
    expect(p).toContain("calendar.events");
    expect(p).toContain("Google API Services User Data Policy");
    expect(p).toContain("Limited Use");
    expect(p).toContain("to you alone"); // the copy of the other Google events is shown to the person who connected the calendar only
  });
  it("only the narrow calendar.events scope is asked for", () => {
    expect(read("src/server/integrations/google.ts")).toMatch(/auth\/calendar\.events openid email/);
    expect(read("src/server/integrations/google.ts")).not.toMatch(/auth\/calendar"/);
  });
  it("a visitor gets a public home page with the policies, not a sign-in wall", () => {
    expect(read("src/app/[locale]/page.tsx")).toContain("<Landing />");
    const landing = read("src/features/landing/Landing.tsx");
    expect(landing).toContain("/legal/privacy");
    expect(landing).toContain("/legal/terms");
  });
});
