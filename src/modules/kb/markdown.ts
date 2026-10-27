/**
 * The small subset of Markdown the knowledge base is written in, parsed into blocks the page draws itself (nothing is ever
 * put into the page as raw HTML):  `## Heading`, `### Subheading`, paragraphs, `- ` lists, `1. ` numbered lists, `> ` a tip,
 * `**bold**` and `[text](address)`.
 */
export type Inline = { t: "text"; v: string } | { t: "bold"; v: string } | { t: "link"; v: string; href: string };

export type Block =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; inline: Inline[] }
  | { type: "ul"; items: Inline[][] }
  | { type: "ol"; items: Inline[][] }
  | { type: "tip"; inline: Inline[] };

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ t: "text", v: text.slice(last, at) });
    if (m[1] !== undefined) out.push({ t: "bold", v: m[1] });
    else out.push({ t: "link", v: m[2] as string, href: m[3] as string });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: Inline[][] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", inline: parseInline(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: list.kind, items: list.items });
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m: RegExpExecArray | null;
    if (line.trim() === "") {
      flushPara();
      flushList();
    } else if ((m = /^###\s+(.*)$/.exec(line))) {
      flushPara();
      flushList();
      blocks.push({ type: "h3", text: m[1] as string });
    } else if ((m = /^##\s+(.*)$/.exec(line))) {
      flushPara();
      flushList();
      blocks.push({ type: "h2", text: m[1] as string });
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      flushPara();
      flushList();
      blocks.push({ type: "tip", inline: parseInline(m[1] as string) });
    } else if ((m = /^-\s+(.*)$/.exec(line))) {
      flushPara();
      if (list?.kind !== "ul") {
        flushList();
        list = { kind: "ul", items: [] };
      }
      list.items.push(parseInline(m[1] as string));
    } else if ((m = /^\d+\.\s+(.*)$/.exec(line))) {
      flushPara();
      if (list?.kind !== "ol") {
        flushList();
        list = { kind: "ol", items: [] };
      }
      list.items.push(parseInline(m[1] as string));
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return blocks;
}

export type LinkTarget = { kind: "app"; path: string } | { kind: "kb"; slug: string } | { kind: "external"; url: string } | null;

/** Where a link points: a page of the app (`app:/start`), another article (`kb:funnel`) or a web address. Anything else is not a link. */
export function resolveLink(href: string): LinkTarget {
  if (href.startsWith("app:/")) return { kind: "app", path: href.slice(4) };
  if (href.startsWith("kb:") && /^[a-z0-9-]+$/.test(href.slice(3))) return { kind: "kb", slug: href.slice(3) };
  if (/^https?:\/\//i.test(href)) return { kind: "external", url: href };
  return null;
}

/** The plain text of a block list, for searching. */
export function plainText(blocks: Block[]): string {
  const inl = (xs: Inline[]) => xs.map((x) => x.v).join("");
  return blocks
    .map((b) => (b.type === "h2" || b.type === "h3" ? b.text : b.type === "p" || b.type === "tip" ? inl(b.inline) : b.items.map(inl).join(" ")))
    .join(" ");
}
