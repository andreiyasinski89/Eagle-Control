import { beforeEach, describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";
import { hashToken, newToken } from "@/lib/token";
import { rateLimit, resetRateLimits } from "@/server/http/rate-limit";
import { DEFAULT_STAGES } from "@/modules/crm/defaults";

describe("slugify", () => {
  it("lowercases and dashes", () => expect(slugify("My Cool Team!")).toBe("my-cool-team"));
  it("transliterates Cyrillic", () => expect(slugify("Мой Отдел")).toBe("moy-otdel"));
  it("strips Polish diacritics", () => expect(slugify("Zażółć gęślą")).toBe("zazolc-gesla"));
  it("falls back when nothing usable remains", () => expect(slugify("!!!")).toBe("workspace"));
  it("caps the length", () => expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(40));
});

describe("tokens", () => {
  it("generates unique url-safe tokens", () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(newToken()).not.toBe(a);
  });
  it("hashes deterministically without leaking the token", () => {
    const t = newToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken(t)).toHaveLength(64);
  });
});

describe("rateLimit", () => {
  beforeEach(resetRateLimits);
  it("blocks after the limit within the window", () => {
    expect(rateLimit("k", 2, 1000, 0)).toBe(true);
    expect(rateLimit("k", 2, 1000, 1)).toBe(true);
    expect(rateLimit("k", 2, 1000, 2)).toBe(false);
  });
  it("resets after the window", () => {
    rateLimit("k", 1, 1000, 0);
    expect(rateLimit("k", 1, 1000, 1001)).toBe(true);
  });
  it("tracks keys independently", () => {
    rateLimit("a", 1, 1000, 0);
    expect(rateLimit("b", 1, 1000, 0)).toBe(true);
  });
});

describe("default pipeline", () => {
  it("ends with exactly one won and one lost stage", () => {
    expect(DEFAULT_STAGES.filter((s) => s.isWon)).toHaveLength(1);
    expect(DEFAULT_STAGES.filter((s) => s.isLost)).toHaveLength(1);
    expect(DEFAULT_STAGES.at(-1)?.isLost).toBe(true);
  });
});
