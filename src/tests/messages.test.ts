import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";

type Tree = { [k: string]: string | Tree };
const load = (l: string): Tree => JSON.parse(readFileSync(join(process.cwd(), "messages", `${l}.json`), "utf8")) as Tree;
const flat = (o: Tree, p = ""): [string, string][] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v] as [string, string]]));

/** The names a message takes in (placeholders, plural counts, tags): a translation must ask for exactly the same ones. */
function names(msg: string): string {
  const out = new Set<string>();
  const walk = (ast: ReturnType<IntlMessageFormat["getAst"]>) => {
    for (const n of ast) {
      if ("value" in n && n.type !== 0) out.add(String(n.value));
      if ("options" in n) for (const o of Object.values(n.options)) walk(o.value);
      if ("children" in n) walk(n.children);
    }
  };
  walk(new IntlMessageFormat(msg, "en").getAst());
  return [...out].sort().join(",");
}

describe("the translations", () => {
  const en = new Map(flat(load("en")));
  it.each(routing.locales.filter((l) => l !== "en"))("%s has every key of English, nothing extra, and the same placeholders in each", (l) => {
    const other = new Map(flat(load(l)));
    expect([...en.keys()].filter((k) => !other.has(k))).toEqual([]);
    expect([...other.keys()].filter((k) => !en.has(k))).toEqual([]);
    const drift = [...other].filter(([k, v]) => names(v) !== names(en.get(k) ?? "")).map(([k]) => k);
    expect(drift).toEqual([]);
  });
});
