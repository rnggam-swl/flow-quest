import { Fragment } from "react";
import { parseMarkdown, type Inline } from "@/lib/content/markdown";

/**
 * Renders authored markdown (see src/lib/content/markdown.ts) as React
 * elements — never as injected HTML, so authored text can't carry markup.
 */

function InlineText({ nodes }: { nodes: Inline[] }) {
  return nodes.map((n, i) => (n.t === "b" ? <b key={i}>{n.v}</b> : n.t === "i" ? <i key={i}>{n.v}</i> : <Fragment key={i}>{n.v}</Fragment>));
}

export function RichText({
  source,
  className,
  paragraphClassName,
  listClassName,
}: {
  source: string;
  className?: string;
  paragraphClassName?: string;
  listClassName?: string;
}) {
  const blocks = parseMarkdown(source);
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        if (b.t === "p") {
          return (
            <p key={i} className={paragraphClassName}>
              <InlineText nodes={b.c} />
            </p>
          );
        }
        const List = b.t;
        return (
          <List key={i} className={listClassName}>
            {b.items.map((item, j) => (
              <li key={j}>
                <InlineText nodes={item} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
