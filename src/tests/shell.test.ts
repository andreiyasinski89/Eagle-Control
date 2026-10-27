import { describe, expect, it } from "vitest";
import { initialsOf, navGroups } from "@/components/layout/nav";

const t = (key: string) => key;

describe("avatar initials", () => {
  it("uses the first and last name", () => {
    expect(initialsOf("Andrei Jasinski", "a@x.io")).toBe("AJ");
    expect(initialsOf("  maria   de  silva ", "a@x.io")).toBe("MS");
  });

  it("uses the start of a single name, or of the address when there is no name", () => {
    expect(initialsOf("Demo", "a@x.io")).toBe("DE");
    expect(initialsOf(null, "zed@x.io")).toBe("ZE");
    expect(initialsOf("", "q@x.io")).toBe("Q@");
  });
});

describe("sidebar navigation", () => {
  const flat = (showCrm: boolean) => navGroups("acme", showCrm, t).flatMap((g) => g.items.map((i) => i.href));

  it("points every link into the workspace", () => {
    expect(flat(true)).toEqual(["/w/acme", "/w/acme/start", "/w/acme/tasks", "/w/acme/projects", "/w/acme/calendar", "/w/acme/time", "/w/acme/notes", "/w/acme/knowledge", "/w/acme/crm", "/w/acme/reports"]);
  });

  it("hides customers for people who may not read the CRM", () => {
    expect(flat(false)).not.toContain("/w/acme/crm");
    expect(navGroups("acme", false, t).map((g) => g.label)).toEqual(["groupWork", "groupInsights"]);
  });

  it("marks only the home link as an exact match", () => {
    const items = navGroups("acme", true, t).flatMap((g) => g.items);
    expect(items.filter((i) => i.exact).map((i) => i.href)).toEqual(["/w/acme"]);
  });
});
