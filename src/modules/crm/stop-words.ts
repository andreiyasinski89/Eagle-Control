/** Promises about money that an ambassador's message must never contain: income, "financial freedom", quick cash. */
const STOP_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "пассивный доход", re: /пассивн\p{L}*\s+(доход|зараб)/u },
  { label: "финансовая свобода", re: /финансов\p{L}*\s+(свобод|независим)/u },
  { label: "гарантированный доход", re: /гарантир\p{L}*\s+(доход|зараб|прибыл)/u },
  { label: "лёгкие/быстрые деньги", re: /(легк|быстр)\p{L}*\s+(деньг|зараб)/u },
  { label: "зарабок без вложений", re: /зараб\p{L}*\s+без\s+вложен/u },
  { label: "сумма дохода", re: /(зараб|доход)\p{L}*[^.!?\n]{0,30}\d[\d\s.,]*\p{L}*(\$|€|usd|eur|евро|долл|руб|злот|pln|zł)/u },
  { label: "pasywny dochód", re: /pasywn\p{L}*\s+doch/u },
  { label: "wolność finansowa", re: /wolno\p{L}*\s+finansow/u },
  { label: "gwarantowany dochód", re: /gwarantowan\p{L}*\s+(doch|zarob)/u },
  { label: "szybki zarobek", re: /(szybk|łatw)\p{L}*\s+(zarob|pieni)/u },
  { label: "passive income", re: /passive\s+income/u },
  { label: "financial freedom", re: /financial\s+(freedom|independence)/u },
  { label: "guaranteed income", re: /guaranteed\s+(income|earnings|profit)/u },
  { label: "get rich quick", re: /(get\s+rich|easy\s+money|quick\s+money)/u },
];

/** The forbidden phrases found in `text` (empty when it is clean). Case and "ё"/"е" do not matter. */
export function findStopWords(text: string): string[] {
  const t = text.toLowerCase().replace(/ё/g, "е");
  return STOP_PATTERNS.filter((p) => p.re.test(t)).map((p) => p.label);
}
