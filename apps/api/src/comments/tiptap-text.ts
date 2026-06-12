// Plain-text derivation from a TipTap document JSON. The derived text is stored
// in Comment.body so a rich comment always keeps a plain-text fallback for
// back-compat, search, and customer-email rendering — body must never be empty
// when bodyJson is present.
//
// Walks the doc tree: text nodes contribute their text; mention nodes render as
// "@<label>" (the mentioned user's display name captured at author time);
// hardBreaks and block-level nodes insert newlines. Defensive against malformed
// input — any non-conforming node is skipped, never throws.

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "listItem",
  "bulletList",
  "orderedList",
  "codeBlock",
  "horizontalRule"
]);

function walk(node: unknown, parts: string[]): void {
  if (!node || typeof node !== "object") return;
  const n = node as { type?: string; text?: unknown; attrs?: any; content?: unknown };

  if (n.type === "text" && typeof n.text === "string") {
    parts.push(n.text);
    return;
  }

  if (n.type === "mention") {
    // TipTap's mention extension stores the rendered name under attrs.label
    // (fallbacks cover alternate configs); prefix with "@" for the plain form.
    const label = n.attrs?.label ?? n.attrs?.name ?? n.attrs?.id;
    if (label != null) parts.push(`@${label}`);
    return;
  }

  if (n.type === "hardBreak") {
    parts.push("\n");
    return;
  }

  if (Array.isArray(n.content)) {
    for (const child of n.content) walk(child, parts);
    // Separate block-level nodes with a newline so paragraphs/list items don't
    // run together in the plain-text fallback.
    if (n.type && BLOCK_TYPES.has(n.type)) parts.push("\n");
  }
}

export function tiptapToPlainText(doc: unknown): string {
  const parts: string[] = [];
  walk(doc, parts);
  return parts
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
