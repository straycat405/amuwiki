"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  clearRecentSearchesAction,
  deleteRecentSearchAction,
} from "@/app/(wiki)/search/actions";
import type { RecentSearch } from "@/features/search/types";

export function RecentSearchChips({ initial }: { initial: RecentSearch[] }) {
  const [recentSearches, setRecentSearches] = useState(initial);

  const remove = (normalizedQuery: string) => {
    setRecentSearches((current) =>
      current.filter((entry) => entry.normalizedQuery !== normalizedQuery),
    );
    void deleteRecentSearchAction(normalizedQuery);
  };

  const clearAll = () => {
    if (!window.confirm("최근 검색 기록을 모두 지울까요?")) return;
    setRecentSearches([]);
    void clearRecentSearchesAction();
  };

  if (recentSearches.length === 0) return null;

  return (
    <div className="search-view__section">
      <div className="search-view__section-header">
        <h2>최근 검색어</h2>
        <button type="button" onClick={clearAll}>
          전체 삭제
        </button>
      </div>
      <ul className="recent-search-chips">
        {recentSearches.map((entry) => (
          <li key={entry.normalizedQuery}>
            <Link href={`/search?q=${encodeURIComponent(entry.displayQuery)}`}>
              {entry.displayQuery}
            </Link>
            <button
              type="button"
              aria-label={`${entry.displayQuery} 최근 검색어 삭제`}
              onClick={() => remove(entry.normalizedQuery)}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
