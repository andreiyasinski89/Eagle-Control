import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

const sw = readFileSync("public/sw.js", "utf8");

describe("manifest", () => {
  const m = manifest();
  it("can be installed: a name, a start page, standalone display and the two icon sizes", () => {
    expect(m.name).toBe("MeetOwl");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });
  it("points at icons that exist", () => {
    for (const i of m.icons ?? []) if (i.src.startsWith("/icons/")) expect(existsSync(`public${i.src}`)).toBe(true);
  });
});

describe("service worker", () => {
  it("never touches the API or other origins, and keeps only the shell", () => {
    expect(sw).toContain('url.pathname.startsWith("/api/")');
    expect(sw).toContain("url.origin !== self.location.origin");
    expect(sw).toContain("/_next/static/");
    expect(sw).not.toMatch(/put\(.*api/);
  });
  it("has an offline page that exists", () => {
    expect(sw).toContain("/offline.html");
    expect(existsSync("public/offline.html")).toBe(true);
  });
  it("only handles GET requests", () => {
    expect(sw).toContain('req.method !== "GET"');
  });
});
