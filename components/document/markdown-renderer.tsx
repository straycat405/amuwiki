"use client";

import type { ComponentProps } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";

import { usePreferences } from "@/components/preferences/preferences-provider";
import {
  remarkWikiLinks,
  type WikiLinkResolutions,
} from "@/lib/markdown/wiki-links";
import { remarkLineBreaks } from "@/lib/markdown/line-breaks";

type MarkdownRendererProps = {
  markdown: string;
  wikiLinkResolutions?: WikiLinkResolutions;
};

function SafeLink({ href = "", children, ...props }: ComponentProps<"a">) {
  const external = /^https?:\/\//i.test(href);

  return (
    <a
      {...props}
      href={href}
      rel={external ? "noopener noreferrer" : undefined}
      target={external ? "_blank" : undefined}
    >
      {children}
    </a>
  );
}

export function MarkdownRenderer({
  markdown,
  wikiLinkResolutions,
}: MarkdownRendererProps) {
  const { preferences } = usePreferences();

  const remarkPlugins: PluggableList = [
    remarkGfm,
    [remarkWikiLinks, wikiLinkResolutions],
  ];
  if (preferences.lineBreakMode === "hard") remarkPlugins.push(remarkLineBreaks);

  return (
    <div className="markdown-body">
      <ReactMarkdown
        components={{ a: SafeLink }}
        remarkPlugins={remarkPlugins}
        urlTransform={defaultUrlTransform}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
