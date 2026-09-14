import type { ComponentProps } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  remarkWikiLinks,
  type WikiLinkResolutions,
} from "@/lib/markdown/wiki-links";

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
  return (
    <div className="markdown-body">
      <ReactMarkdown
        components={{ a: SafeLink }}
        remarkPlugins={[remarkGfm, [remarkWikiLinks, wikiLinkResolutions]]}
        urlTransform={defaultUrlTransform}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
