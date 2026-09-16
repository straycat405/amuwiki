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
import { createPortal } from "react-dom";

import {
  clearRecentSearchesAction,
  deleteRecentSearchAction,
  getSearchLandingAction,
  recordSearchAction,
  searchAction,
} from "@/app/(wiki)/search/actions";
import { SearchResultContext } from "@/components/search/search-result-context";
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
  // 검색어 응답을 기다리는 동안 true. 입력 이벤트에서 켜고, 응답이 도착하거나
  // 검색어가 비워지면 끈다 — 잘못된 "결과 없음"이 잠깐 보이는 것을 막기 위함이다.
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [recentViews, setRecentViews] = useState<RecentView[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<number | null>(null);
  const requestId = useRef(0);

  const trimmedQuery = query.trim();

  const updateQuery = useCallback((value: string) => {
    setQuery(value);
    setIsSearching(value.trim().length > 0);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setIsSearching(false);
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
    if (!open) return;
    document.body.classList.add("command-palette-open");
    document.documentElement.classList.add("command-palette-open");
    return () => {
      document.body.classList.remove("command-palette-open");
      document.documentElement.classList.remove("command-palette-open");
    };
  }, [open]);

  useEffect(() => {
    if (!open || !trimmedQuery) return;
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    const thisRequest = ++requestId.current;
    debounceTimer.current = window.setTimeout(() => {
      void searchAction(trimmedQuery).then((found) => {
        if (requestId.current !== thisRequest) return;
        setResults(found);
        setIsSearching(false);
      });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, [trimmedQuery, open]);

  const items = useMemo<PaletteItem[]>(() => {
    if (trimmedQuery) {
      // 아직 이 검색어의 응답이 도착하지 않았다면 이전 검색어의 결과를 보여주지 않는다.
      if (isSearching) return [];
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
  }, [trimmedQuery, isSearching, results, recentSearches, recentViews]);

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
        updateQuery(item.recentSearch.displayQuery);
        setHighlightedIndex(0);
        inputRef.current?.focus();
      }
    },
    [openDocument, updateQuery],
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

      {open
        ? createPortal(
            <div className="command-palette-overlay" role="presentation">
              <div
                className="command-palette-backdrop"
                aria-hidden="true"
                onPointerDown={close}
              />
              <div
                className="command-palette"
                role="dialog"
                aria-modal="true"
                aria-label="문서 검색"
              >
                <div className="command-palette__input-row">
                  <Search size={18} aria-hidden="true" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    placeholder="제목, 별칭, 본문으로 검색"
                    onChange={(event) => {
                      updateQuery(event.target.value);
                      setHighlightedIndex(0);
                    }}
                    onKeyDown={handleKeyDown}
                  />
                </div>

                <div className="command-palette__results">
                  {trimmedQuery && isSearching ? (
                    <p className="command-palette__loading" role="status">
                      검색 중…
                    </p>
                  ) : null}

                  {trimmedQuery && !isSearching && items.length === 0 ? (
                    <p className="command-palette__empty">
                      검색 결과가 없습니다.
                    </p>
                  ) : null}

                  {!trimmedQuery &&
                  recentSearches.length === 0 &&
                  recentViews.length === 0 ? (
                    <p className="command-palette__empty">
                      최근 검색어나 최근 문서가 없습니다.
                    </p>
                  ) : null}

                  {!trimmedQuery && recentSearches.length > 0 ? (
                    <section
                      className="command-palette__recent-searches"
                      aria-labelledby="recent-searches-title"
                    >
                      <div className="command-palette__section-header">
                        <span id="recent-searches-title">최근 검색어</span>
                        <button type="button" onClick={clearAllRecentSearches}>
                          전체 삭제
                        </button>
                      </div>
                      <ul className="command-palette__recent-search-list">
                        {recentSearches.map((recentSearch, index) => {
                          const item: PaletteItem = {
                            type: "recent-search",
                            key: `search:${recentSearch.normalizedQuery}`,
                            recentSearch,
                          };
                          return (
                            <li key={item.key}>
                              <button
                                type="button"
                                className={
                                  "command-palette__recent-search" +
                                  (index === highlightedIndex
                                    ? " command-palette__recent-search--active"
                                    : "")
                                }
                                onMouseEnter={() => setHighlightedIndex(index)}
                                onClick={() => selectItem(item)}
                              >
                                <Clock size={14} aria-hidden="true" />
                                <span>{recentSearch.displayQuery}</span>
                              </button>
                              <button
                                type="button"
                                className="command-palette__recent-search-remove"
                                aria-label={`${recentSearch.displayQuery} 최근 검색어 삭제`}
                                onClick={() =>
                                  removeRecentSearch(
                                    recentSearch.normalizedQuery,
                                  )
                                }
                              >
                                <X size={12} aria-hidden="true" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ) : null}

                  {trimmedQuery || recentViews.length > 0 ? (
                    <ul className="command-palette__item-list">
                      {!trimmedQuery && recentViews.length > 0 ? (
                        <li className="command-palette__section-header">
                          <span>최근 문서</span>
                        </li>
                      ) : null}
                      {(trimmedQuery
                        ? items
                        : items.slice(recentSearches.length)
                      ).map((item, index) => {
                        const itemIndex = trimmedQuery
                          ? index
                          : index + recentSearches.length;
                        return (
                          <li key={item.key}>
                            <button
                              type="button"
                              className={
                                "command-palette__item" +
                                (itemIndex === highlightedIndex
                                  ? " command-palette__item--active"
                                  : "")
                              }
                              onMouseEnter={() =>
                                setHighlightedIndex(itemIndex)
                              }
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
                                  {item.result.matchedContext ? (
                                    <SearchResultContext
                                      className="command-palette__match-context"
                                      context={item.result.matchedContext}
                                      query={trimmedQuery}
                                    />
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
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
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
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
