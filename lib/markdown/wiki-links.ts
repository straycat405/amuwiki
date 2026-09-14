import type { Link, Parent, Root, Text } from "mdast";
import { visit } from "unist-util-visit";

import { slugifyDocumentTitle, slugifyHeading } from "@/lib/markdown/slug";

const wikiLinkPattern = /\[\[([^\]|#]+?)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

function createWikiLink(target: string, heading: string | undefined, label: string): Link {
  const slug = slugifyDocumentTitle(target);
  const hash = heading ? `#${slugifyHeading(heading)}` : "";

  return {
    type: "link",
    url: `/documents/${slug}${hash}`,
    children: [{ type: "text", value: label }],
    data: {
      hProperties: {
        className: ["concept-link"],
        "data-wiki-target": target.trim(),
      },
    },
  };
}

function splitWikiLinks(node: Text): Array<Text | Link> {
  const result: Array<Text | Link> = [];
  let cursor = 0;

  for (const match of node.value.matchAll(wikiLinkPattern)) {
    const index = match.index;
    const fullMatch = match[0];
    const target = match[1]?.trim();
    if (index === undefined || !target) continue;

    if (index > cursor) {
      result.push({ type: "text", value: node.value.slice(cursor, index) });
    }

    const heading = match[2]?.trim();
    const label = match[3]?.trim() || target;
    result.push(createWikiLink(target, heading, label));
    cursor = index + fullMatch.length;
  }

  if (cursor === 0) return [node];
  if (cursor < node.value.length) {
    result.push({ type: "text", value: node.value.slice(cursor) });
  }

  return result;
}

export function remarkWikiLinks() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (index === undefined || !parent) return;

      const replacement = splitWikiLinks(node);
      if (replacement.length === 1 && replacement[0] === node) return;

      parent.children.splice(index, 1, ...replacement);
      return index + replacement.length;
    });
  };
}
