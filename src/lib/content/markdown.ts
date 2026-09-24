/**
 * The rich-text format for authored content (module explanations, quiz
 * feedback): a deliberately tiny markdown subset. It's parsed into a small
 * tree that renderers walk, so authored text is never injected as HTML — the
 * reason it replaces the raw-HTML "text" widgets Modul Latihan started with.
 *
 *   Paragraphs are separated by a blank line.
 *   Lines starting with "- " form a bulleted list; "1. " (any number) a numbered list.
 *   **bold** and *italic* work inside any line.
 */

export type Inline = { t: "text" | "b" | "i"; v: string };
export type Block = { t: "p"; c: Inline[] } | { t: "ul" | "ol"; items: Inline[][] };

const BULLET = /^- (.*)$/;
const NUMBERED = /^\d+\. (.*)$/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
    out.push(m[1] !== undefined ? { t: "b", v: m[1] } : { t: "i", v: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ t: "p", c: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  for (const raw of source.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (!line) {
      flush();
    } else if (bullet || numbered) {
      flush();
      const kind = bullet ? "ul" : "ol";
      const item = parseInline((bullet ?? numbered)![1]);
      const prev = blocks[blocks.length - 1];
      if (prev && prev.t === kind) prev.items.push(item);
      else blocks.push({ t: kind, items: [item] });
    } else {
      // A plain line right after a list starts a new paragraph rather than continuing the list.
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inlineToHtml(inline: Inline[]) {
  return inline.map((n) => (n.t === "text" ? escapeHtml(n.v) : `<${n.t}>${escapeHtml(n.v)}</${n.t}>`)).join("");
}

/** HTML for places that need a string (downloadable reports, fidelity tests) — always escaped. */
export function markdownToHtml(source: string): string {
  return parseMarkdown(source)
    .map((b) =>
      b.t === "p" ? `<p>${inlineToHtml(b.c)}</p>` : `<${b.t}>${b.items.map((i) => `<li>${inlineToHtml(i)}</li>`).join("")}</${b.t}>`
    )
    .join("");
}

/** Plain text, e.g. for a truncated preview in a list. */
export function markdownToText(source: string): string {
  return parseMarkdown(source)
    .map((b) => (b.t === "p" ? b.c.map((n) => n.v).join("") : b.items.map((i) => i.map((n) => n.v).join("")).join("\n")))
    .join("\n\n");
}

/** Authored text that still contains HTML tags — almost certainly pasted from the old format. */
export function looksLikeHtml(source: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(source);
}
