import type { Heading, Root } from "mdast";
import { visit } from "unist-util-visit";

import { slugifyHeading } from "@/lib/markdown/slug";

function headingText(node: Heading): string {
  let text = "";
  visit(node, "text", (child) => {
    text += child.value;
  });
  return text;
}

/**
 * Assigns each heading the same #slug the `[[문서#제목]]` wiki-link anchor already computes
 * (lib/markdown/wiki-links.ts), so those links actually land on something and a table of
 * contents can link to the same ids.
 */
export function remarkHeadingIds() {
  return (tree: Root) => {
    visit(tree, "heading", (node: Heading) => {
      const text = headingText(node).trim();
      if (!text) return;
      node.data ??= {};
      node.data.hProperties ??= {};
      (node.data.hProperties as Record<string, unknown>).id = slugifyHeading(text);
    });
  };
}
