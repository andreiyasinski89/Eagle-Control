// Merge translation fragments into messages/{en,ru,pl,uk}.json and fail if the locales drift apart.
// Usage: node scripts/i18n-merge.mjs path/to/fragment.mjs   (fragment exports default { en, ru, pl, uk })
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const deepMerge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(a[k] ?? {}, v) : v;
  return out;
};
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]));

if (process.argv[2]) {
  const frag = (await import(pathToFileURL(path.resolve(process.argv[2])).href)).default;
  for (const code of ["en", "ru", "pl", "uk"]) {
    const file = `messages/${code}.json`;
    writeFileSync(file, JSON.stringify(deepMerge(JSON.parse(readFileSync(file, "utf8")), frag[code] ?? {}), null, 2) + "\n");
  }
}

const keys = Object.fromEntries(["en", "ru", "pl", "uk"].map((c) => [c, new Set(flat(JSON.parse(readFileSync(`messages/${c}.json`, "utf8"))))]));
let bad = false;
for (const c of ["ru", "pl", "uk"]) {
  const missing = [...keys.en].filter((k) => !keys[c].has(k));
  const extra = [...keys[c]].filter((k) => !keys.en.has(k));
  if (missing.length || extra.length) {
    bad = true;
    console.error(c, "missing:", missing, "extra:", extra);
  }
}
console.log(bad ? "LOCALES DIFFER" : `locales in sync (${keys.en.size} keys)`);
process.exit(bad ? 1 : 0);
