"use client";

import { ExternalLink, GripVertical, Pin, X } from "lucide-react";
import Link from "next/link";
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { AskInCard } from "@/components/document/ask-in-card";
import { MarkdownRenderer } from "@/components/document/markdown-renderer";
import { usePreferences } from "@/components/preferences/preferences-provider";
import type { WikiLinkResolutions } from "@/lib/markdown/wiki-links";

type PreviewDocument = {
  slug: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  wikiLinkResolutions: WikiLinkResolutions;
};

type CardPosition = { x: number; y: number };
type PreviewCard = PreviewDocument & {
  id: string;
  position: CardPosition;
};

type WikiLinkExplorerProps = {
  markdown: string;
  wikiLinkResolutions: WikiLinkResolutions;
  /** Enables "ask" inside pinned cards; requires a stored API key. */
  aiEnabled?: boolean;
  pageSlug?: string | null;
};

const CLOSE_DELAY_MS = 150;
const CARD_WIDTH = 360;
const CARD_OFFSET = 16;
const VIEWPORT_MARGIN = 12;
const MAX_PINNED_CARDS = 10;

function linkSlug(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const link = target.closest<HTMLAnchorElement>("a.concept-link");
  if (!link || link.dataset.wikiStatus === "missing") return null;
  const match = link.getAttribute("href")?.match(/^\/documents\/([^#?/]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function cardPosition(x: number, y: number): CardPosition {
  return {
    x: Math.max(
      VIEWPORT_MARGIN,
      Math.min(x + CARD_OFFSET, window.innerWidth - CARD_WIDTH - VIEWPORT_MARGIN),
    ),
    y: Math.max(VIEWPORT_MARGIN, y + CARD_OFFSET),
  };
}

function positionWithinViewport(
  position: CardPosition,
  width: number,
  height: number,
): CardPosition {
  return {
    x: Math.max(
      VIEWPORT_MARGIN,
      Math.min(position.x, window.innerWidth - width - VIEWPORT_MARGIN),
    ),
    y: Math.max(
      VIEWPORT_MARGIN,
      Math.min(position.y, window.innerHeight - height - VIEWPORT_MARGIN),
    ),
  };
}

export function WikiLinkExplorer({
  markdown,
  wikiLinkResolutions,
  aiEnabled = false,
  pageSlug = null,
}: WikiLinkExplorerProps) {
  const { preferences } = usePreferences();
  const [hoveredCard, setHoveredCard] = useState<PreviewCard | null>(null);
  const [pinnedCards, setPinnedCards] = useState<PreviewCard[]>([]);
  const [notice, setNotice] = useState("");
  const hoveredSlug = useRef<string | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const requestCache = useRef(new Map<string, Promise<PreviewDocument | null>>());
  const dragState = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const fetchPreview = useCallback((slug: string) => {
    const cached = requestCache.current.get(slug);
    if (cached) return cached;

    const request = fetch(`/api/documents/preview?slug=${encodeURIComponent(slug)}`)
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as PreviewDocument;
      })
      .catch(() => null);
    requestCache.current.set(slug, request);
    return request;
  }, []);

  const showPreview = useCallback(
    async (slug: string, position: CardPosition) => {
      const preview = await fetchPreview(slug);
      if (!preview || hoveredSlug.current !== slug) return;
      setHoveredCard({ ...preview, id: `hover:${preview.slug}`, position });
    },
    [fetchPreview],
  );

  const schedulePreview = useCallback(
    (slug: string, position: CardPosition) => {
      clearHoverTimer();
      clearCloseTimer();
      hoveredSlug.current = slug;
      hoverTimer.current = window.setTimeout(() => {
        void showPreview(slug, position);
      }, preferences.tooltipDelayMs);
    },
    [clearCloseTimer, clearHoverTimer, preferences.tooltipDelayMs, showPreview],
  );

  const closePreview = useCallback(() => {
    clearHoverTimer();
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      hoveredSlug.current = null;
      setHoveredCard(null);
    }, CLOSE_DELAY_MS);
  }, [clearCloseTimer, clearHoverTimer]);

  const pinPreview = useCallback(
    async (slug: string, position: CardPosition) => {
      const existing = pinnedCards.find((card) => card.slug === slug);
      if (existing) {
        setPinnedCards((cards) => [
          ...cards.filter((card) => card.slug !== slug),
          existing,
        ]);
        return;
      }
      if (pinnedCards.length >= MAX_PINNED_CARDS) {
        setNotice(`고정 카드는 최대 ${MAX_PINNED_CARDS}개까지 열 수 있습니다.`);
        return;
      }
      const preview = await fetchPreview(slug);
      if (!preview) return;
      setPinnedCards((cards) => {
        if (cards.some((card) => card.slug === preview.slug)) return cards;
        if (cards.length >= MAX_PINNED_CARDS) {
          setNotice(`고정 카드는 최대 ${MAX_PINNED_CARDS}개까지 열 수 있습니다.`);
          return cards;
        }
        return [
          ...cards,
          { ...preview, id: `pin:${preview.slug}`, position },
        ];
      });
      setNotice("");
    },
    [fetchPreview, pinnedCards],
  );

  const handlePointerOver = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!preferences.tooltipEnabled) return;
    const slug = linkSlug(event.target);
    if (!slug) return;
    schedulePreview(slug, cardPosition(event.clientX, event.clientY));
  };

  const handlePointerOut = (event: ReactPointerEvent<HTMLDivElement>) => {
    const leavingSlug = linkSlug(event.target);
    if (!leavingSlug) return;
    const enteringSlug = linkSlug(event.relatedTarget);
    if (enteringSlug === leavingSlug) return;
    closePreview();
  };

  const handleConceptClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const slug = linkSlug(event.target);
    if (!slug || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const position = cardPosition(event.clientX, event.clientY);
    hoveredSlug.current = slug;
    void pinPreview(slug, position);
  };

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, card: PreviewCard) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      id: card.id,
      offsetX: event.clientX - card.position.x,
      offsetY: event.clientY - card.position.y,
    };
  };

  const dragCard = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current;
    if (!drag) return;
    const position = cardPosition(
      event.clientX - drag.offsetX - CARD_OFFSET,
      event.clientY - drag.offsetY - CARD_OFFSET,
    );
    setPinnedCards((cards) =>
      cards.map((card) => (card.id === drag.id ? { ...card, position } : card)),
    );
  };

  const stopDrag = () => {
    dragState.current = null;
  };

  useEffect(
    () => () => {
      clearHoverTimer();
      clearCloseTimer();
    },
    [clearCloseTimer, clearHoverTimer],
  );

  return (
    <div
      className="wiki-link-explorer"
      onClick={handleConceptClick}
      onPointerOut={handlePointerOut}
      onPointerOver={handlePointerOver}
    >
      <MarkdownRenderer markdown={markdown} wikiLinkResolutions={wikiLinkResolutions} />
      <span className="visually-hidden" aria-live="polite">
        {notice}
      </span>
      {hoveredCard ? (
        <PreviewCardView
          card={hoveredCard}
          kind="hover"
          onEnter={clearCloseTimer}
          onLeave={closePreview}
          onPositionChange={(position) =>
            setHoveredCard((card) =>
              card?.id === hoveredCard.id ? { ...card, position } : card,
            )
          }
        />
      ) : null}
      {pinnedCards.map((card) => (
        <PreviewCardView
          ask={aiEnabled ? <AskInCard pageSlug={pageSlug} slug={card.slug} /> : null}
          card={card}
          key={card.id}
          kind="pinned"
          onClose={() => setPinnedCards((cards) => cards.filter((item) => item.id !== card.id))}
          onDragEnd={stopDrag}
          onDragMove={dragCard}
          onDragStart={(event) => startDrag(event, card)}
          onPositionChange={(position) =>
            setPinnedCards((cards) =>
              cards.map((item) => (item.id === card.id ? { ...item, position } : item)),
            )
          }
        />
      ))}
    </div>
  );
}

function PreviewCardView({
  ask,
  card,
  kind,
  onClose,
  onDragEnd,
  onDragMove,
  onDragStart,
  onEnter,
  onLeave,
  onPositionChange,
}: {
  ask?: ReactNode;
  card: PreviewCard;
  kind: "hover" | "pinned";
  onClose?: () => void;
  onDragEnd?: () => void;
  onDragMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDragStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onEnter?: () => void;
  onLeave?: () => void;
  onPositionChange?: (position: CardPosition) => void;
}) {
  const cardRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = cardRef.current;
    if (!element || !onPositionChange) return;
    const { width, height } = element.getBoundingClientRect();
    const position = positionWithinViewport(card.position, width, height);
    if (position.x !== card.position.x || position.y !== card.position.y) {
      onPositionChange(position);
    }
  }, [card.position, onPositionChange]);

  return (
    <section
      aria-label={`${card.title} ${kind === "pinned" ? "고정 카드" : "미리보기"}`}
      className={`preview-card preview-card--${kind}`}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      ref={cardRef}
      style={{ left: card.position.x, top: card.position.y }}
    >
      <header className="preview-card__header">
        {kind === "pinned" ? (
          <button
            aria-label="카드 이동"
            className="preview-card__drag"
            onPointerCancel={onDragEnd}
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            type="button"
          >
            <GripVertical size={16} aria-hidden="true" />
          </button>
        ) : (
          <Pin size={15} aria-hidden="true" />
        )}
        <Link href={`/documents/${card.slug}`}>{card.title}</Link>
        <Link
          aria-label="해당 문서로 이동"
          className="preview-card__open"
          href={`/documents/${card.slug}`}
          rel="noopener noreferrer"
          target="_blank"
          title="새 탭에서 해당 문서 열기"
        >
          <ExternalLink size={15} aria-hidden="true" />
        </Link>
        {onClose ? (
          <button aria-label="고정 카드 닫기" className="preview-card__close" onClick={onClose} type="button">
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </header>
      {card.summary ? <p className="preview-card__summary">{card.summary}</p> : null}
      <div className="preview-card__body">
        <MarkdownRenderer
          markdown={card.bodyMarkdown}
          wikiLinkResolutions={card.wikiLinkResolutions}
        />
      </div>
      {ask}
    </section>
  );
}
