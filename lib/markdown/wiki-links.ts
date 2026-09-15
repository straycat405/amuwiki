import type { Link, Parent, Root, Text } from "mdast";
import { visit } from "unist-util-visit";

import {
  normalizeConcept,
  slugifyDocumentTitle,
  slugifyHeading,
} from "@/lib/markdown/slug";

const wikiLinkPattern = /\[\[([^\]|#]+?)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

export type WikiLinkTarget = {
  title: string;
  normalizedTitle: string;
  firstPosition: number;
};

export type WikiLinkResolution = {
  href: string;
  title: string;
};

export type WikiLinkResolutions = Record<string, WikiLinkResolution>;

export function extractWikiLinkTargets(markdown: string): WikiLinkTarget[] {
  return [...markdown.matchAll(wikiLinkPattern)].flatMap((match) => {
    const target = match[1]?.trim();
    if (!target || match.index === undefined) return [];
    return [
      { title: target, normalizedTitle: normalizeConcept(target), firstPosition: match.index },
    ];
  });
}

function createWikiLink(
  target: string,
  heading: string | undefined,
  label: string,
  resolutions?: WikiLinkResolutions,
): Link {
  const resolution = resolutions?.[normalizeConcept(target)];
  const href = resolution?.href ?? `/documents/${slugifyDocumentTitle(target)}`;
  const hash = heading ? `#${slugifyHeading(heading)}` : "";

  return {
    type: "link",
    url: `${href}${hash}`,
    children: [{ type: "text", value: label }],
    data: {
      hProperties: {
        className: [
          "concept-link",
          ...(resolutions && !resolution ? ["concept-link--missing"] : []),
        ],
        "data-wiki-target": target.trim(),
        "data-wiki-status": resolution ? "resolved" : "missing",
      },
    },
  };
}

function splitWikiLinks(
  node: Text,
  resolutions?: WikiLinkResolutions,
): Array<Text | Link> {
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
    result.push(createWikiLink(target, heading, label, resolutions));
    cursor = index + fullMatch.length;
  }

  if (cursor === 0) return [node];
  if (cursor < node.value.length) {
    result.push({ type: "text", value: node.value.slice(cursor) });
  }

  return result;
}

export function remarkWikiLinks(resolutions?: WikiLinkResolutions) {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (index === undefined || !parent) return;

      const replacement = splitWikiLinks(node, resolutions);
      if (replacement.length === 1 && replacement[0] === node) return;

      parent.children.splice(index, 1, ...replacement);
      return index + replacement.length;
    });
  };
}
