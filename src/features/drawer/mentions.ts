import type { CommentDoc } from "./types";

export interface Mentionable {
  id: string;
  label: string;
}

/** The `@query` being typed right before the caret, if any. */
export function mentionQuery(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([\p{L}\p{N}._-]*)$/u.exec(before);
  return m ? { query: m[2] ?? "", start: before.length - (m[2]?.length ?? 0) - 1 } : null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Turns composer text into a document. `@Label` for every picked person becomes a mention node,
 * so the id travels with the text instead of being guessed from a name later.
 */
export function buildCommentDoc(text: string, picked: readonly Mentionable[]): { doc: CommentDoc; mentions: string[] } {
  const labels = [...picked].sort((a, b) => b.label.length - a.label.length);
  const mentions = new Set<string>();
  const paragraphs = text.split(/\n{2,}/).map((para) => {
    const content: NonNullable<NonNullable<CommentDoc["content"]>[number]["content"]> = [];
    if (labels.length === 0) {
      if (para) content.push({ type: "text", text: para });
    } else {
      const re = new RegExp(`(@(?:${labels.map((l) => escapeRe(l.label)).join("|")}))(?![\\p{L}\\p{N}])`, "u");
      for (const part of para.split(new RegExp(re.source, "gu"))) {
        if (!part) continue;
        const hit = labels.find((l) => part === `@${l.label}`);
        if (hit) {
          mentions.add(hit.id);
          content.push({ type: "mention", attrs: { id: hit.id, label: hit.label } });
        } else {
          content.push({ type: "text", text: part });
        }
      }
    }
    return { type: "paragraph" as const, content };
  });
  return { doc: { type: "doc", content: paragraphs }, mentions: [...mentions] };
}
