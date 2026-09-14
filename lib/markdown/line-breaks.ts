import type { Break, Parent, Root, Text } from "mdast";
import { visit } from "unist-util-visit";

function splitSoftBreaks(node: Text): Array<Text | Break> {
  if (!node.value.includes("\n")) return [node];

  const lines = node.value.split(/\r?\n/);
  const replacement: Array<Text | Break> = [];
  lines.forEach((line, index) => {
    if (line) replacement.push({ type: "text", value: line });
    if (index < lines.length - 1) replacement.push({ type: "break" });
  });
  return replacement;
}

/** Renders a single editor newline as a visible line break without parsing raw HTML. */
export function remarkLineBreaks() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (index === undefined || !parent) return;

      const replacement = splitSoftBreaks(node);
      if (replacement.length === 1 && replacement[0] === node) return;

      parent.children.splice(index, 1, ...replacement);
      return index + replacement.length;
    });
  };
}
