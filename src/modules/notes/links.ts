/** Only web addresses are ever made clickable: a "javascript:" or "data:" address in a note must stay text. */
export function safeUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v || v.length > 2000) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The web addresses written in a text, in order, each once. Trailing punctuation that belongs to the sentence is not part of the address. */
export function extractUrls(text: string, max = 50): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const cleaned = m[0].replace(/[.,;:!?)\]}»”]+$/u, "");
    const ok = safeUrl(cleaned);
    if (ok) found.add(cleaned);
    if (found.size >= max) break;
  }
  return [...found];
}

/** "example.com" for a link, to show beside a title. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The first line or two of a note, flattened, for a list. */
export function previewOf(body: string, max = 160): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
