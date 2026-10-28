import { describe, expect, it } from "vitest";
import { STAGES } from "@/modules/crm/people";
import { fillScript } from "@/modules/crm/tracker";
import { STARTER_SCRIPTS, starterLocale, type StarterLocale } from "@/modules/crm/starter-scripts";

const LOCALES = Object.keys(STARTER_SCRIPTS) as StarterLocale[];

describe("ready-made scripts", () => {
  it.each(LOCALES)("%s: every stage of the funnel has a script, and there are some for any moment", (l) => {
    const sets = STARTER_SCRIPTS[l];
    for (const s of STAGES) expect(sets.some((x) => x.stage === s), `${l}: ${s}`).toBe(true);
    expect(sets.some((x) => x.stage === null)).toBe(true);
  });

  it("the three languages have the same stages in the same order", () => {
    const shape = (l: StarterLocale) => STARTER_SCRIPTS[l].map((x) => x.stage);
    expect(shape("en")).toEqual(shape("ru"));
    expect(shape("pl")).toEqual(shape("ru"));
  });

  it.each(LOCALES)("%s: titles are unique and every text fits the limits and uses only known placeholders", (l) => {
    const sets = STARTER_SCRIPTS[l];
    expect(new Set(sets.map((x) => x.title.toLowerCase())).size).toBe(sets.length);
    for (const s of sets) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.title.length).toBeLessThanOrEqual(120);
      expect(s.body.length).toBeLessThanOrEqual(4000);
      for (const m of s.body.matchAll(/\{([^}]*)\}/g)) expect(["name", "full_name", "my_name"]).toContain(m[1]);
      // all filled in: nothing curly is left behind
      expect(fillScript(s.body, { name: "Anna", fullName: "Anna K", myName: "Me" })).not.toMatch(/[{}]/);
    }
  });

  it("picks the language, English for anything unknown", () => {
    expect(starterLocale("ru")).toBe("ru");
    expect(starterLocale("pl")).toBe("pl");
    expect(starterLocale("de")).toBe("en");
    expect(starterLocale(null)).toBe("en");
  });
});
