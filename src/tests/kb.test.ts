import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ARTICLES, articleFor, articlesFor, CATEGORIES, langFor, searchArticles } from "@/modules/kb/articles";
import { parseInline, parseMarkdown, plainText, resolveLink } from "@/modules/kb/markdown";
import { STEPS } from "@/modules/onboarding/steps";

describe("the Markdown subset", () => {
  it("reads headings, paragraphs, lists, a tip, bold and links", () => {
    const b = parseMarkdown("## Title\nFirst line\nsecond line\n\n- one\n- **two** [x](kb:funnel)\n\n1. a\n2. b\n\n> Tip: wait\n### Sub");
    expect(b.map((x) => x.type)).toEqual(["h2", "p", "ul", "ol", "tip", "h3"]);
    expect(b[1]).toEqual({ type: "p", inline: [{ t: "text", v: "First line second line" }] });
    const ul = b[2] as { items: unknown[][] };
    expect(ul.items[1]).toEqual([{ t: "bold", v: "two" }, { t: "text", v: " " }, { t: "link", v: "x", href: "kb:funnel" }]);
    expect(plainText(b)).toContain("Tip: wait");
  });
  it("parses inline text with nothing special as one piece", () => {
    expect(parseInline("plain")).toEqual([{ t: "text", v: "plain" }]);
    expect(parseInline("a **b** c")).toEqual([{ t: "text", v: "a " }, { t: "bold", v: "b" }, { t: "text", v: " c" }]);
  });
  it("makes links only to the app, to an article or to the web", () => {
    expect(resolveLink("app:/start")).toEqual({ kind: "app", path: "/start" });
    expect(resolveLink("kb:day-plan")).toEqual({ kind: "kb", slug: "day-plan" });
    expect(resolveLink("https://example.com/a")).toEqual({ kind: "external", url: "https://example.com/a" });
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "app:start", "kb:Bad Slug", "ftp://x", "//evil.com"]) expect(resolveLink(bad), bad).toBeNull();
  });
});

describe("the articles", () => {
  const langs = ["ru", "en"] as const;
  it("every article exists in Russian and in English, with a title, a summary and a text", () => {
    for (const l of langs) {
      const list = articlesFor(l);
      expect(list.map((a) => a.slug)).toEqual(ARTICLES.map((a) => a.slug));
      for (const a of list) {
        expect(a.title.length, `${l}/${a.slug} title`).toBeGreaterThan(3);
        expect(a.summary.length, `${l}/${a.slug} summary`).toBeGreaterThan(10);
        expect(a.blocks.length, `${l}/${a.slug} blocks`).toBeGreaterThan(3);
        expect(a.blocks.some((b) => b.type === "h2" || b.type === "ul" || b.type === "ol"), `${l}/${a.slug} structure`).toBe(true);
      }
    }
  });
  it("every link in every article points at something that exists", () => {
    const slugs = new Set(ARTICLES.map((a) => a.slug));
    const pages = ["/", "/start", "/settings", "/crm/people", "/crm/day", "/crm/scripts", "/crm/team", "/crm/network", "/time", "/notes"];
    for (const l of langs) {
      for (const a of articlesFor(l)) {
        for (const b of a.blocks) {
          const inlines = b.type === "p" || b.type === "tip" ? b.inline : b.type === "ul" || b.type === "ol" ? b.items.flat() : [];
          for (const i of inlines) {
            if (i.t !== "link") continue;
            const target = resolveLink(i.href);
            expect(target, `${l}/${a.slug}: ${i.href}`).not.toBeNull();
            if (target?.kind === "kb") expect(slugs.has(target.slug), `${l}/${a.slug} -> ${i.href}`).toBe(true);
            if (target?.kind === "app") expect(pages.includes(target.path), `${l}/${a.slug} -> ${i.href}`).toBe(true);
          }
        }
      }
    }
  });
  it("slugs are unique, categories are known, and every category has articles", () => {
    expect(new Set(ARTICLES.map((a) => a.slug)).size).toBe(ARTICLES.length);
    for (const c of CATEGORIES) expect(ARTICLES.some((a) => a.category === c), c).toBe(true);
  });
  it("Polish and any other language read the English articles", () => {
    expect(langFor("ru")).toBe("ru");
    expect(langFor("pl")).toBe("en");
    expect(langFor("en")).toBe("en");
    expect(articleFor("funnel", "ru")?.title).toBe("Воронка и стадии");
    expect(articleFor("nope", "en")).toBeNull();
  });
  it("each step of getting started has an article to learn it from", () => {
    const slugs = new Set(ARTICLES.map((a) => a.slug));
    for (const s of STEPS) expect(slugs.has(s.article), s.id).toBe(true);
  });
});

describe("searching the articles", () => {
  const en = articlesFor("en");
  const ru = articlesFor("ru");
  it("finds by the title first, then by the text; every word must be there", () => {
    expect(searchArticles(en, "timer")[0]?.slug).toBe("timer");
    expect(searchArticles(en, "script")[0]?.slug).toBe("scripts-autoplans");
    expect(searchArticles(ru, "воронк")[0]?.slug).toBe("funnel");
    expect(searchArticles(en, "partner sponsor").map((a) => a.slug)).toContain("partners");
    expect(searchArticles(en, "zzzz")).toEqual([]);
    expect(searchArticles(en, "timer zzzz")).toEqual([]);
  });
  it("an empty search gives the whole list in order", () => {
    expect(searchArticles(en, "  ").map((a) => a.slug)).toEqual(ARTICLES.map((a) => a.slug));
  });
});

describe("the downloadable guide", () => {
  const dir = join(process.cwd(), "public", "guide");
  it("has a PDF and a presentation for each language the knowledge base reads", () => {
    for (const l of ["ru", "en"]) {
      for (const f of [`MeetOwl-guide-${l}.pdf`, `MeetOwl-presentation-${l}.pptx`]) expect(existsSync(join(dir, f)), f).toBe(true);
    }
  });
  it("the PDFs are PDFs and the presentations are zip packages", () => {
    for (const l of ["ru", "en"]) {
      expect(readFileSync(join(dir, `MeetOwl-guide-${l}.pdf`)).subarray(0, 5).toString()).toBe("%PDF-");
      expect(readFileSync(join(dir, `MeetOwl-presentation-${l}.pptx`)).subarray(0, 2).toString()).toBe("PK");
    }
  });
});
