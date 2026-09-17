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
type TrailItem = { slug: string; title: string };

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
// business-rules.md: 화면에는 고정 카드가 최대 세 개만 동시에 보이고 이전 탐색은 경로로 접힌다.
const MAX_PINNED_CARDS = 3;
const FIRST_CARD_HINT_KEY = "amuwiki:hint:card-explore-seen";

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
  const [trail, setTrail] = useState<TrailItem[]>([]);
  const [notice, setNotice] = useState("");
  const [showFirstCardHint, setShowFirstCardHint] = useState(false);
  const hoveredSlug = useRef<string | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const requestCache = useRef(new Map<string, Promise<PreviewDocument | null>>());
  // 카드를 연 Wiki link(키보드 포커스를 되돌려줄 대상)와, 열린 카드의 DOM 엘리먼트.
  const triggerRefs = useRef(new Map<string, HTMLElement>());
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const pendingFocusId = useRef<string | null>(null);
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
        pendingFocusId.current = existing.id;
        setPinnedCards((cards) => [
          ...cards.filter((card) => card.slug !== slug),
          existing,
        ]);
        return;
      }

      if (pinnedCards.length === 0) {
        try {
          if (!window.localStorage.getItem(FIRST_CARD_HINT_KEY)) {
            setShowFirstCardHint(true);
            window.localStorage.setItem(FIRST_CARD_HINT_KEY, "1");
          }
        } catch {
          // localStorage를 쓸 수 없어도 카드 탐색 자체는 계속 동작해야 한다.
        }
      }

      const preview = await fetchPreview(slug);
      if (!preview) return;
      if (pinnedCards.some((card) => card.slug === preview.slug)) return;

      // 카드가 이미 3개 열려 있으면 가장 먼저 열었던 카드를 닫는 대신
      // 탐색 경로로 접어 사용자가 다시 열어볼 수 있게 남긴다.
      const oldest = pinnedCards.length >= MAX_PINNED_CARDS ? pinnedCards[0] : undefined;
      if (oldest) {
        setTrail((current) => [
          ...current.filter(
            (item) => item.slug !== oldest.slug && item.slug !== preview.slug,
          ),
          { slug: oldest.slug, title: oldest.title },
        ]);
        setNotice(`'${oldest.title}'를 탐색 경로로 접고 '${preview.title}'를 열었습니다.`);
      } else {
        setTrail((current) => current.filter((item) => item.slug !== preview.slug));
        setNotice("");
      }

      pendingFocusId.current = `pin:${preview.slug}`;
      setPinnedCards((cards) => {
        if (cards.some((card) => card.slug === preview.slug)) return cards;
        const next = cards.length >= MAX_PINNED_CARDS ? cards.slice(1) : cards;
        return [...next, { ...preview, id: `pin:${preview.slug}`, position }];
      });
    },
    [fetchPreview, pinnedCards],
  );

  // 카드가 (재)열릴 때 카드 컨테이너로 포커스를 옮겨, 키보드/스크린리더 사용자가
  // 카드가 열렸음을 바로 인식하고 안에서 탐색을 시작할 수 있게 한다.
  useEffect(() => {
    const id = pendingFocusId.current;
    if (!id) return;
    pendingFocusId.current = null;
    cardRefs.current.get(id)?.focus();
  }, [pinnedCards]);

  const closePinnedCard = useCallback((id: string) => {
    setPinnedCards((cards) => cards.filter((item) => item.id !== id));
    const trigger = triggerRefs.current.get(id);
    triggerRefs.current.delete(id);
    cardRefs.current.delete(id);
    trigger?.focus();
  }, []);

  const reopenFromTrail = useCallback(
    (item: TrailItem) => {
      hoveredSlug.current = item.slug;
      void pinPreview(item.slug, cardPosition(window.innerWidth / 2, window.innerHeight / 3));
    },
    [pinPreview],
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
    const linkEl =
      event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>("a.concept-link")
        : null;
    if (linkEl) triggerRefs.current.set(`pin:${slug}`, linkEl);
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
      {trail.length > 0 ? (
        <nav aria-label="탐색 경로" className="exploration-trail">
          <span className="exploration-trail__root">현재 문서</span>
          {trail.map((item) => (
            <span className="exploration-trail__step" key={item.slug}>
              <span aria-hidden="true" className="exploration-trail__arrow">
                →
              </span>
              <button
                className="exploration-trail__item"
                onClick={() => reopenFromTrail(item)}
                type="button"
              >
                {item.title}
              </button>
            </span>
          ))}
        </nav>
      ) : null}
      {showFirstCardHint && pinnedCards.length > 0 ? (
        <div className="explorer-hint" role="status">
          <p>클릭하면 현재 문서를 떠나지 않고 관련 문서를 엽니다.</p>
          <button
            aria-label="안내 닫기"
            className="explorer-hint__dismiss"
            onClick={() => setShowFirstCardHint(false)}
            type="button"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}
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
          onClose={() => closePinnedCard(card.id)}
          registerElement={(element) => {
            if (element) cardRefs.current.set(card.id, element);
            else cardRefs.current.delete(card.id);
          }}
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
  registerElement,
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
  registerElement?: (element: HTMLElement | null) => void;
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
      aria-modal={kind === "pinned" ? false : undefined}
      className={`preview-card preview-card--${kind}`}
      onKeyDown={
        kind === "pinned"
          ? (event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                onClose?.();
              }
            }
          : undefined
      }
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      ref={(element) => {
        cardRef.current = element;
        registerElement?.(element);
      }}
      role={kind === "pinned" ? "dialog" : undefined}
      style={{ left: card.position.x, top: card.position.y }}
      tabIndex={kind === "pinned" ? -1 : undefined}
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
        <Link
          aria-label={`${card.title} 문서로 이동 (카드 닫힘)`}
          href={`/documents/${card.slug}`}
          title="이 문서로 이동합니다(카드가 닫힙니다)"
        >
          {card.title}
        </Link>
        <Link
          aria-label={`${card.title} 새 탭에서 열기`}
          className="preview-card__open"
          href={`/documents/${card.slug}`}
          rel="noopener noreferrer"
          target="_blank"
          title="새 탭에서 이 문서 열기(카드는 유지됨)"
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
