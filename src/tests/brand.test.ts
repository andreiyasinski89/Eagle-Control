import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAND_NAME } from "@/lib/brand";

const read = (p: string) => readFileSync(p, "utf8");
const locales = ["en", "ru", "pl", "uk"];

describe("the name people see", () => {
  it("is MLM CRM", () => {
    expect(BRAND_NAME).toBe("MLM CRM");
  });

  it.each(locales)("%s: no screen text still says the old name, except the two technical names that must stay", (l) => {
    const text = read(`messages/${l}.json`);
    // the header of signed webhooks and the bot's username are not names to read: other programs and Telegram know them as they are
    const rest = text.replace(/MeetOwl-Signature/g, "").replace(/MeetOwlBot/g, "");
    expect(rest).not.toMatch(/MeetOwl/i);
    expect(text).toContain("MLM CRM");
  });

  it("the help articles, the terms, the site icon and the offline page use the new name and mark", () => {
    for (const f of ["src/modules/kb/content-en.ts", "src/modules/kb/content-ru.ts", "src/modules/kb/content-uk.ts", "src/app/[locale]/legal/terms/page.tsx", "src/app/icon.svg", "public/offline.html"]) expect(read(f), f).not.toMatch(/MeetOwl/);
    expect(read("src/app/icon.svg")).toContain("MLM CRM");
    expect(read("public/offline.html")).not.toContain("🦉");
  });
});
