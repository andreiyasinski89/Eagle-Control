import { describe, expect, it } from "vitest";
import { overlayMessages, resolveUiMode, SIMPLE_TERMS } from "@/modules/ui-mode";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
import pl from "../../messages/pl.json";
import uk from "../../messages/uk.json";

describe("resolveUiMode", () => {
  it("takes the person's own choice first", () => {
    expect(resolveUiMode("advanced", true)).toBe("advanced");
    expect(resolveUiMode("simple", false)).toBe("simple");
  });
  it("is simple by default for somebody who came through an invitation, advanced for the rest", () => {
    expect(resolveUiMode(null, true)).toBe("simple");
    expect(resolveUiMode(undefined, false)).toBe("advanced");
    expect(resolveUiMode("weird", false)).toBe("advanced");
  });
});

describe("overlayMessages", () => {
  it("puts the lines over a copy and leaves the original alone", () => {
    const base = { a: { b: "x", c: "y" }, d: "z" };
    const out = overlayMessages(base, { a: { b: "NEW" } });
    expect(out).toEqual({ a: { b: "NEW", c: "y" }, d: "z" });
    expect(base.a.b).toBe("x");
  });
});

const all = { en, ru, pl, uk };
const get = (o: unknown, path: string) => path.split(".").reduce<unknown>((n, p) => (n as Record<string, unknown> | undefined)?.[p], o);
const leaves = (o: Record<string, unknown>, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? leaves(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));

describe("simple terms", () => {
  it("only replace lines that exist, in every language, with the same placeholders", () => {
    for (const l of ["en", "ru", "pl", "uk"] as const) {
      for (const key of leaves(SIMPLE_TERMS[l])) {
        const base = get(all[l], key);
        const over = get(SIMPLE_TERMS[l], key);
        expect(typeof base, `${l} ${key}`).toBe("string");
        expect([...String(over).matchAll(/\{(\w+)\}/g)].map((m) => m[1]), `${l} ${key}`).toEqual([...String(base).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
      }
    }
  });
  it("names the same lines in every language", () => {
    const ref = leaves(SIMPLE_TERMS.en).sort();
    for (const l of ["ru", "pl", "uk"] as const) expect(leaves(SIMPLE_TERMS[l]).sort()).toEqual(ref);
  });
  it("calls the work tree goal, week, action and step", () => {
    expect(get(SIMPLE_TERMS.ru, "map.type.EPIC")).toBe("Цель");
    expect(get(SIMPLE_TERMS.ru, "map.type.SPRINT")).toBe("Неделя");
    expect(get(SIMPLE_TERMS.ru, "map.type.TASK")).toBe("Действие");
  });
});
