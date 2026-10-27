import { EN } from "./content-en";
import { parseMarkdown, plainText, type Block } from "./markdown";
import { RU } from "./content-ru";

export type Lang = "ru" | "en";
export type Category = "start" | "people" | "tools" | "rhythm";

export interface ArticleText {
  title: string;
  summary: string;
  body: string;
}

export interface ArticleMeta {
  slug: string;
  category: Category;
}

/** The order here is the order of the list. */
export const ARTICLES: ArticleMeta[] = [
  { slug: "quick-start", category: "start" },
  { slug: "app-tour", category: "start" },
  { slug: "tasks", category: "start" },
  { slug: "funnel", category: "people" },
  { slug: "list-100", category: "people" },
  { slug: "scripts-autoplans", category: "people" },
  { slug: "day-plan", category: "people" },
  { slug: "groups", category: "people" },
  { slug: "partners", category: "people" },
  { slug: "network-map", category: "people" },
  { slug: "dream-goals", category: "people" },
  { slug: "timer", category: "tools" },
  { slug: "notes", category: "tools" },
  { slug: "daily-rhythm", category: "rhythm" },
  { slug: "weekly-rhythm", category: "rhythm" },
];

export const CATEGORIES: Category[] = ["start", "people", "tools", "rhythm"];

const TEXTS: Record<Lang, Record<string, ArticleText>> = { ru: RU, en: EN };

/** Russian has its own articles; every other language reads the English ones until it is translated. */
export const langFor = (locale: string): Lang => (locale === "ru" ? "ru" : "en");

export interface Article extends ArticleMeta, ArticleText {
  blocks: Block[];
}

export function articleFor(slug: string, lang: Lang): Article | null {
  const meta = ARTICLES.find((a) => a.slug === slug);
  const text = TEXTS[lang][slug];
  if (!meta || !text) return null;
  return { ...meta, ...text, blocks: parseMarkdown(text.body) };
}

export function articlesFor(lang: Lang): Article[] {
  return ARTICLES.map((a) => articleFor(a.slug, lang)).filter((a): a is Article => a !== null);
}

/** Matches a search: the title weighs most, then the summary, then the text. Every word must be found somewhere. */
export function searchArticles(list: Article[], q: string): Article[] {
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return list;
  const scored: { a: Article; score: number }[] = [];
  for (const a of list) {
    const title = a.title.toLowerCase();
    const summary = a.summary.toLowerCase();
    const body = plainText(a.blocks).toLowerCase();
    let score = 0;
    let all = true;
    for (const w of words) {
      const s = (title.includes(w) ? 10 : 0) + (summary.includes(w) ? 4 : 0) + (body.includes(w) ? 1 : 0);
      if (s === 0) {
        all = false;
        break;
      }
      score += s;
    }
    if (all) scored.push({ a, score });
  }
  return scored.sort((x, y) => y.score - x.score).map((s) => s.a);
}
