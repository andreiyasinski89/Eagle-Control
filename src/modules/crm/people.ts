/**
 * People in a funnel: the stages, how to read them from words people actually write (in a sheet, in a chat), and how to turn
 * a pasted list of names into people. Pure, so the board, the import and the quick add all agree.
 */

export const STAGES = ["NEW", "FIRST_CONTACT", "WARMING", "PRESENTATION", "DECIDING", "CLIENT", "PARTNER", "DECLINED", "NO_REPLY"] as const;
export type Stage = (typeof STAGES)[number];

/** The columns of the board, left to right: the way in, then the two good outcomes; the two dead ends are kept apart. */
export const BOARD_STAGES = ["NEW", "FIRST_CONTACT", "WARMING", "PRESENTATION", "DECIDING", "CLIENT", "PARTNER"] as const satisfies readonly Stage[];
export const SIDE_STAGES = ["DECLINED", "NO_REPLY"] as const satisfies readonly Stage[];
/** People who are still on the way: not yet a client or a partner, not out of the game. */
export const IN_PLAY: readonly Stage[] = ["NEW", "FIRST_CONTACT", "WARMING", "PRESENTATION", "DECIDING"];

export const TEMPERATURES = ["HOT", "WARM", "COLD"] as const;
export type Temp = (typeof TEMPERATURES)[number];

export const INTERESTS = ["Wellness", "Доход/бизнес", "Путешествия"] as const;
export const SOURCES = ["Instagram", "Telegram", "Facebook", "Сарафан", "Холодный контакт", "Рекомендация", "Другое"] as const;

/** A name for how many people to list before sorting them out. */
export const LIST_GOAL = 100;

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const STAGE_WORDS: Record<Stage, string[]> = {
  NEW: ["новый лид", "новый контакт", "новый", "лид", "new", "lead"],
  FIRST_CONTACT: ["первый контакт", "приглашен", "написал", "first contact", "invited"],
  WARMING: ["прогрев", "прогревается", "греется", "наблюдает", "пока наблюдает", "запланировать", "warming"],
  PRESENTATION: ["презентация встреча", "презентация", "презентация проведена", "встреча", "видеозвонок", "оффлайн встреча", "офлайн встреча", "выслал презентацию", "звонок", "presentation", "meeting"],
  DECIDING: ["принимает решение", "думает", "на раздумье", "готов к регистрации", "deciding", "thinking"],
  CLIENT: ["клиент", "зарегистрирован", "client", "registered"],
  PARTNER: ["партнер", "часть команды", "в команде", "partner", "team"],
  DECLINED: ["отказ", "отказался", "declined", "refused"],
  NO_REPLY: ["не отвечает", "молчит", "нет ответа", "no reply"],
};

/** "Видеозвонок", "Часть команды", "Новый лид", "partner" … → the stage, or null for words that say nothing about it ("Пока нет"). */
export function parseStage(text: string | null | undefined): Stage | null {
  const t = squash(text ?? "");
  if (!t) return null;
  for (const stage of STAGES) if (STAGE_WORDS[stage].some((w) => t === squash(w))) return stage;
  for (const stage of STAGES) if (STAGE_WORDS[stage].some((w) => squash(w).length >= 5 && t.includes(squash(w)))) return stage;
  return null;
}

/**
 * Sheets often split the funnel over two columns: what was done ("Видеозвонок") and what the person decided ("Думает",
 * "Часть команды"). A decision that means something wins over what was done.
 */
export function stageFromSheet(done: string | null | undefined, decision: string | null | undefined): Stage | null {
  const d = parseStage(decision);
  if (d === "DECIDING" || d === "PARTNER" || d === "CLIENT" || d === "DECLINED") return d;
  return parseStage(done) ?? d;
}

const TEMP_WORDS: Record<Temp, string[]> = {
  HOT: ["горячий", "горячая", "hot", "🔥"],
  WARM: ["теплый", "тёплый", "средний", "warm", "🟡"],
  COLD: ["холодный", "холодная", "cold", "❄️"],
};

/** "Теплый", "Средний", "hot", "🔥" … → how close the person is ("Средний" counts as warm). */
export function parseTemperature(text: string | null | undefined): Temp | null {
  const raw = (text ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes("🔥")) return "HOT";
  if (raw.includes("❄")) return "COLD";
  if (raw.includes("🟡")) return "WARM";
  const t = squash(raw);
  for (const k of TEMPERATURES) if (TEMP_WORDS[k].some((w) => squash(w) !== "" && (t === squash(w) || t.startsWith(squash(w))))) return k;
  return null;
}

/** What matters more to the person: travel (П) or business (Б). Stored as a code; the letters of the team's sheets are read as the same thing. */
export const PRIORITIES = ["TRAVEL", "BUSINESS"] as const;
export type Priority = (typeof PRIORITIES)[number];
const PRIORITY_WORDS: Record<Priority, string[]> = {
  TRAVEL: ["п", "p", "путешествия", "путешествие", "travel", "podróże", "podroze"],
  BUSINESS: ["б", "b", "бизнес", "business", "biznes"],
};

export function parsePriority(text: string | null | undefined): Priority | null {
  const raw = (text ?? "").trim().toLowerCase().replace(/[.!?:;,()\s]+/g, " ").trim();
  if (!raw) return null;
  for (const k of PRIORITIES) if (PRIORITY_WORDS[k].includes(raw)) return k;
  return null;
}

const INTEREST_WORDS: [string, string[]][] = [
  ["Wellness", ["wellness", "велнес", "здоровье", "нутрициология"]],
  ["Доход/бизнес", ["доход", "бизнес", "доход бизнес", "income", "business"]],
  ["Путешествия", ["путешествия", "travel", "mwr", "поездки"]],
];

/** "Wellness, Путешествия" → known interests under their usual names; anything else is kept as typed. Commas and semicolons separate. */
export function parseInterests(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of (text ?? "").split(/[,;|\n]+/)) {
    const raw = part.trim();
    if (!raw) continue;
    const k = squash(raw);
    const known = INTEREST_WORDS.find(([, words]) => words.some((w) => k === squash(w) || k.startsWith(squash(w))));
    const name = known ? known[0] : raw.slice(0, 40);
    if (!out.includes(name)) out.push(name);
  }
  return out.slice(0, 8);
}

/** "11", "11 баллов" → 11; 0 to 100, anything else is nothing. */
export function parseInfluence(text: string | number | null | undefined): number | null {
  if (typeof text === "number") return Number.isInteger(text) && text >= 0 && text <= 100 ? text : null;
  const m = /^\s*(\d{1,3})\b/.exec(text ?? "");
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
}

/** "20.09.2026", "20/09/26", "2026-09-20" → an ISO instant at midnight UTC; null when it is not a date. */
export function parseLooseDate(text: string | null | undefined): string | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  const eu = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (eu) [y, m, d] = [Number(eu[3]) < 100 ? 2000 + Number(eu[3]) : Number(eu[3]), Number(eu[2]), Number(eu[1])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date.toISOString() : null;
}

// ── a pasted list of names ─────────────────────────────────────────────────

export interface PersonLine {
  name: string;
  telegram?: string;
  phone?: string;
  note?: string;
}

export const MAX_PEOPLE_AT_ONCE = 300;
const MARKER = /^(?:[-*•–—]+|\d{1,3}[.)])\s+/;

/**
 * One line, one person. Anything after a semicolon or a tab is read by what it looks like: "@name" is a Telegram name,
 * something with digits is a phone, the rest is a note; a note can also follow the name after " — " or " - ".
 *
 *   Anna Kowalska; @annak; +48 600 111 222
 *   Egor Potapov — met at the conference
 *   12. Katya and Alex (Cyprus)
 */
export function parsePeopleLines(text: string): { people: PersonLine[]; truncated: boolean } {
  const people: PersonLine[] = [];
  let truncated = false;
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    while (MARKER.test(line)) line = line.replace(MARKER, "");
    if (!line || /^[-*•–—]+$|^\d{1,3}[.)]$/.test(line)) continue;
    if (people.length >= MAX_PEOPLE_AT_ONCE) {
      truncated = true;
      break;
    }
    const [head = "", ...rest] = line.split(/[;\t]/).map((p) => p.trim());
    const dash = /\s[—–-]\s/.exec(head);
    const name = (dash ? head.slice(0, dash.index) : head).trim().slice(0, 100);
    const notes: string[] = dash ? [head.slice(dash.index + dash[0].length).trim()] : [];
    const p: PersonLine = { name };
    for (const part of rest) {
      if (!part) continue;
      if (/^@[\w.]{2,}$/.test(part) && !p.telegram) p.telegram = part;
      else if (/^[+\d][\d\s().-]{6,}$/.test(part) && !p.phone) p.phone = part;
      else notes.push(part);
    }
    if (notes.length) p.note = notes.filter(Boolean).join("; ").slice(0, 500);
    if (name) people.push(p);
  }
  return { people, truncated };
}
