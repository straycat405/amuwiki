"use client";

import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";

import { usePreferences } from "@/components/preferences/preferences-provider";
import {
  remarkWikiLinks,
  type WikiLinkResolutions,
} from "@/lib/markdown/wiki-links";
import { remarkHeadingIds } from "@/lib/markdown/heading-ids";
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
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!lightboxSrc) return;
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxSrc(null);
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [lightboxSrc]);

  const remarkPlugins: PluggableList = [
    remarkGfm,
    [remarkWikiLinks, wikiLinkResolutions],
    remarkHeadingIds,
  ];
  if (preferences.lineBreakMode === "hard") remarkPlugins.push(remarkLineBreaks);

  return (
    <div className="markdown-body">
      <ReactMarkdown
        components={{
          a: SafeLink,
          img: ({ src, alt }) =>
            typeof src === "string" ? (
              <img
                alt={alt ?? ""}
                loading="lazy"
                onClick={() => setLightboxSrc(src)}
                src={src}
              />
            ) : null,
        }}
        remarkPlugins={remarkPlugins}
        urlTransform={defaultUrlTransform}
      >
        {markdown}
      </ReactMarkdown>
      {lightboxSrc ? (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="이미지 확대 보기"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            className="image-lightbox__close"
            type="button"
            aria-label="닫기"
            onClick={() => setLightboxSrc(null)}
          >
            <X size={20} aria-hidden="true" />
          </button>
          <img alt="" src={lightboxSrc} onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
    </div>
  );
}
