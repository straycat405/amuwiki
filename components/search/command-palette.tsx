"use client";

import { Clock, FileText, Search, X } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  clearRecentSearchesAction,
  deleteRecentSearchAction,
  getSearchLandingAction,
  recordSearchAction,
  searchAction,
} from "@/app/(wiki)/search/actions";
import type { RecentView } from "@/features/history/types";
import type { RecentSearch, SearchResult } from "@/features/search/types";

const DEBOUNCE_MS = 150;

type PaletteItem =
  | { type: "result"; key: string; result: SearchResult }
  | { type: "recent-search"; key: string; recentSearch: RecentSearch }
  | { type: "recent-view"; key: string; recentView: RecentView };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [recentViews, setRecentViews] = useState<RecentView[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<number | null>(null);
  const requestId = useRef(0);

  const trimmedQuery = query.trim();

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setHighlightedIndex(0);
  }, []);

  useEffect(() => {
    const handleKeydown = (event: globalThis.KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey;
      if (isMod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      if (event.key === "Escape" && open) {
        close();
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    void getSearchLandingAction().then(({ recentSearches, recentViews }) => {
      setRecentSearches(recentSearches);
      setRecentViews(recentViews);
    });
  }, [open]);

  useEffect(() => {
    if (!open || !trimmedQuery) return;
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    const thisRequest = ++requestId.current;
    debounceTimer.current = window.setTimeout(() => {
      void searchAction(trimmedQuery).then((found) => {
        if (requestId.current !== thisRequest) return;
        setResults(found);
      });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, [trimmedQuery, open]);

  const items = useMemo<PaletteItem[]>(() => {
    if (trimmedQuery) {
      return results.map((result) => ({
        type: "result",
        key: result.documentId,
        result,
      }));
    }
    return [
      ...recentSearches.map((recentSearch) => ({
        type: "recent-search" as const,
        key: `search:${recentSearch.normalizedQuery}`,
        recentSearch,
      })),
      ...recentViews.map((recentView) => ({
        type: "recent-view" as const,
        key: `view:${recentView.documentId}`,
        recentView,
      })),
    ];
  }, [trimmedQuery, results, recentSearches, recentViews]);

  const openDocument = useCallback(
    (slug: string, shouldRecordSearch: boolean) => {
      if (shouldRecordSearch && trimmedQuery) {
        void recordSearchAction(trimmedQuery);
      }
      close();
      router.push(`/documents/${slug}` as Route);
    },
    [close, router, trimmedQuery],
  );

  const goToSearchPage = useCallback(() => {
    if (!trimmedQuery) return;
    void recordSearchAction(trimmedQuery);
    const target = `/search?q=${encodeURIComponent(trimmedQuery)}`;
    close();
    router.push(target as Route);
  }, [close, router, trimmedQuery]);

  const selectItem = useCallback(
    (item: PaletteItem) => {
      if (item.type === "result") {
        openDocument(item.result.slug, true);
      } else if (item.type === "recent-view") {
        openDocument(item.recentView.slug, false);
      } else {
        setQuery(item.recentSearch.displayQuery);
        setHighlightedIndex(0);
        inputRef.current?.focus();
      }
    },
    [openDocument],
  );

  const removeRecentSearch = useCallback((normalizedQuery: string) => {
    setRecentSearches((current) =>
      current.filter((entry) => entry.normalizedQuery !== normalizedQuery),
    );
    void deleteRecentSearchAction(normalizedQuery);
  }, []);

  const clearAllRecentSearches = useCallback(() => {
    if (!window.confirm("최근 검색 기록을 모두 지울까요?")) return;
    setRecentSearches([]);
    void clearRecentSearchesAction();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(index + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[highlightedIndex];
      if (item) selectItem(item);
      else if (trimmedQuery) goToSearchPage();
    }
  };

  return (
    <>
      <button
        className="search-button"
        type="button"
        aria-label="문서 검색"
        onClick={() => setOpen(true)}
      >
        <Search size={17} aria-hidden="true" />
        <span>검색</span>
        <kbd>⌘ K</kbd>
      </button>

      {open ? (
        <div
          className="command-palette-overlay"
          role="presentation"
          onClick={close}
        >
          <div
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="문서 검색"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="command-palette__input-row">
              <Search size={18} aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                placeholder="문서 제목이나 별칭으로 검색"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleKeyDown}
              />
            </div>

            <div className="command-palette__results">
              {trimmedQuery && items.length === 0 ? (
                <p className="command-palette__empty">검색 결과가 없습니다.</p>
              ) : null}

              {!trimmedQuery && items.length === 0 ? (
                <p className="command-palette__empty">
                  최근 검색어나 최근 문서가 없습니다.
                </p>
              ) : null}

              <ul>
                {items.map((item, index) => (
                  <li key={item.key}>
                    {item.type === "recent-search" && index === 0 ? (
                      <div className="command-palette__section-header">
                        <span>최근 검색어</span>
                        <button type="button" onClick={clearAllRecentSearches}>
                          전체 삭제
                        </button>
                      </div>
                    ) : null}
                    {item.type === "recent-view" &&
                    items[index - 1]?.type !== "recent-view" ? (
                      <div className="command-palette__section-header">
                        <span>최근 문서</span>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className={
                        "command-palette__item" +
                        (index === highlightedIndex
                          ? " command-palette__item--active"
                          : "")
                      }
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => selectItem(item)}
                    >
                      {item.type === "result" ? (
                        <>
                          <FileText size={16} aria-hidden="true" />
                          <span className="command-palette__item-title">
                            {item.result.title}
                          </span>
                          {item.result.matchedAlias ? (
                            <span className="command-palette__item-meta">
                              별칭: {item.result.matchedAlias}
                            </span>
                          ) : null}
                        </>
                      ) : item.type === "recent-view" ? (
                        <>
                          <Clock size={16} aria-hidden="true" />
                          <span className="command-palette__item-title">
                            {item.recentView.title}
                          </span>
                        </>
                      ) : (
                        <>
                          <Search size={15} aria-hidden="true" />
                          <span className="command-palette__item-title">
                            {item.recentSearch.displayQuery}
                          </span>
                        </>
                      )}
                    </button>
                    {item.type === "recent-search" ? (
                      <button
                        type="button"
                        className="command-palette__item-remove"
                        aria-label={`${item.recentSearch.displayQuery} 최근 검색어 삭제`}
                        onClick={() =>
                          removeRecentSearch(item.recentSearch.normalizedQuery)
                        }
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            {trimmedQuery ? (
              <div className="command-palette__footer">
                <a
                  href={`/search?q=${encodeURIComponent(trimmedQuery)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    goToSearchPage();
                  }}
                >
                  전체 결과 페이지에서 보기
                </a>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
