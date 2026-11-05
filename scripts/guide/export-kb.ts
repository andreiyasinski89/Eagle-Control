// Step 1 of rebuilding the PDF guides: writes the knowledge-base articles (en, ru) as JSON.
//   npx tsx scripts/guide/export-kb.ts scripts/guide/kb.json
// Step 2: python scripts/guide/build_guide.py <out.pdf>   (needs `pip install reportlab`, Arial fonts; writes MLM-CRM-guide-en/ru.pdf next to the script: copy them to public/guide/)
import { writeFileSync } from "node:fs";
import { articlesFor, CATEGORIES } from "../../src/modules/kb/articles";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";

type Messages = { kb: { category: Record<string, string> }; crm?: { autoDefault?: Record<string, string> } };
const out: Record<string, unknown> = {};
for (const [lang, m] of [["en", en], ["ru", ru]] as const) {
  const k = (m as unknown as Messages).kb;
  out[lang] = {
    cats: CATEGORIES.map((c) => k.category[c]),
    autoDefault: (m as unknown as Messages).crm?.autoDefault ?? null,
    articles: articlesFor(lang).map((a) => ({ slug: a.slug, category: a.category, title: a.title, summary: a.summary, blocks: a.blocks })),
  };
}
writeFileSync(process.argv[2] ?? "scripts/guide/kb.json", JSON.stringify(out));
