import { describe, expect, it } from "vitest";
import { checkLimit, hasFeature } from "@/modules/plans";

describe("checkLimit", () => {
  it("allows up to the Free user limit", () => {
    expect(checkLimit("FREE", "users", 2).allowed).toBe(true);
    expect(checkLimit("FREE", "users", 3).allowed).toBe(false);
  });
  it("reports the limit and current usage", () => {
    expect(checkLimit("FREE", "projects", 3)).toEqual({ allowed: false, limit: 3, current: 3 });
  });
  it("is unlimited on Pro", () => {
    expect(checkLimit("PRO", "users", 10_000).allowed).toBe(true);
  });
  it("supports adding several at once", () => {
    expect(checkLimit("FREE", "contacts", 298, 3).allowed).toBe(false);
    expect(checkLimit("FREE", "contacts", 298, 2).allowed).toBe(true);
  });
});

describe("hasFeature", () => {
  it("gates AI to paid plans and SSO to Enterprise", () => {
    expect(hasFeature("FREE", "ai")).toBe(false);
    expect(hasFeature("PRO", "ai")).toBe(true);
    expect(hasFeature("PRO", "sso")).toBe(false);
    expect(hasFeature("ENTERPRISE", "sso")).toBe(true);
  });
});
