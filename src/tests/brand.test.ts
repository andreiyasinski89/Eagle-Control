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

describe("the name in e-mails", () => {
  it("no e-mail text says the old name (sign-in, welcome, invitation, codes, deletion, test mail, the link under a notice)", () => {
    for (const f of ["src/server/auth/mail-texts.ts", "src/server/services/invitation.ts", "src/server/services/platform-setup.ts"]) expect(read(f), f).not.toMatch(/MeetOwl/);
    // account.ts and notify.ts keep the old name only in a comment (the technical export format is in lower case)
    for (const f of ["src/server/services/account.ts", "src/server/services/notify.ts"]) expect(read(f).split("\n").filter((l) => /MeetOwl/.test(l) && !/^\s*(\*|\/\/|\/\*)/.test(l)), f).toEqual([]);
  });
});

describe("the name in the code other programs and people read", () => {
  it("API, MCP, webhooks, bots and downloads say MLM CRM; only the technical names stay", () => {
    for (const f of ["src/server/mcp/server.ts", "src/server/public-api/openapi.ts", "src/server/integrations/slack.ts", "src/server/integrations/telegram.ts", "src/server/integrations/telegram-agent.ts", "src/server/integrations/google.ts", "src/modules/ai/prompts.ts", "src/app/api/mcp/route.ts"]) {
      expect(read(f).split("\n").filter((l) => /MeetOwl/.test(l) && !/^\s*(\*|\/\/|\/\*)/.test(l)), f).toEqual([]);
    }
  });
  it("the empty screens use the mark, not the owl", () => {
    for (const f of ["MyDayView", "MaterialsView", "TeamView", "TeamMap", "PeopleBoard"]) expect(read(`src/features/crm/${f}.tsx`), f).not.toContain("🦉");
  });
});
