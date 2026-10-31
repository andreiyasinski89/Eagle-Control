import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? tsxFiles(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("loading states", () => {
  const root = join(process.cwd(), "src");
  const files = tsxFiles(root).map((f) => ({ name: relative(root, f).replace(/\\/g, "/"), text: readFileSync(f, "utf8") }));

  it("finds the UI files", () => expect(files.length).toBeGreaterThan(100));

  it("shows a skeleton while data loads, never a bare ellipsis", () => {
    const bare = files.filter((f) => />\s*…\s*</.test(f.text)).map((f) => f.name);
    expect(bare).toEqual([]);
  });

  it("announces a loading skeleton to screen readers", () => {
    const skeleton = readFileSync(join(root, "components/ui/skeleton.tsx"), "utf8");
    expect(skeleton).toContain('role="status"');
    expect(skeleton).toContain('aria-busy="true"');
  });
});

describe("speed of the frame", () => {
  const root = join(process.cwd(), "src");
  it("shows a loading page at once when a section of the workspace is opened", () => {
    expect(() => readFileSync(join(root, "app/[locale]/w/[slug]/loading.tsx"), "utf8")).not.toThrow();
  });
  it("asks for the session once per page, not in each layout and page on its own", () => {
    for (const f of ["app/[locale]/w/[slug]/layout.tsx", "app/[locale]/w/[slug]/page.tsx", "features/crm/server.ts"]) {
      const text = readFileSync(join(root, f), "utf8");
      expect(text, f).toContain("getSession");
      expect(text, f).not.toMatch(/\bawait auth\(\)/);
    }
  });
});
