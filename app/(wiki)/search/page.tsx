import { Search } from "lucide-react";
import Link from "next/link";

import { RecentSearchChips } from "@/components/search/recent-search-chips";
import { SearchResultContext } from "@/components/search/search-result-context";
import { listRecentViews } from "@/features/history/data";
import {
  listRecentSearches,
  recordSearch,
  searchDocuments,
} from "@/features/search/data";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "검색" };

const SEARCH_PAGE_LIMIT = 30;

export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  const params = await searchParams;
  const rawQuery = params.q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery) ?? "";
  const trimmedQuery = query.trim();

  const user = await requireOwner();
  const supabase = await createClient();

  const [results, recentSearches, recentViews] = await Promise.all([
    trimmedQuery
      ? searchDocuments(supabase, trimmedQuery, SEARCH_PAGE_LIMIT)
      : Promise.resolve([]),
    trimmedQuery ? Promise.resolve([]) : listRecentSearches(supabase, user.id),
    trimmedQuery ? Promise.resolve([]) : listRecentViews(supabase, user.id),
  ]);

  if (trimmedQuery) {
    await recordSearch(supabase, trimmedQuery);
  }

  return (
    <main className="document-stage document-stage--reading" id="main-content">
      <section className="search-view" aria-labelledby="search-title">
        <header className="search-view__header">
          <Search size={22} aria-hidden="true" />
          <h1 id="search-title">검색</h1>
        </header>

        <form className="search-view__form" action="/search" method="GET">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="제목, 별칭, 본문으로 검색"
            aria-label="검색어"
          />
          <button type="submit" className="primary-button">
            검색
          </button>
        </form>

        {trimmedQuery ? (
          <>
            <p className="search-view__summary">
              &quot;{trimmedQuery}&quot; 검색 결과 {results.length}건
              {results.length >= SEARCH_PAGE_LIMIT
                ? ` (상위 ${SEARCH_PAGE_LIMIT}개까지 표시, 검색어를 구체화하면 더 정확합니다)`
                : ""}
            </p>
            {results.length === 0 ? (
              <p className="search-view__empty">검색 결과가 없습니다.</p>
            ) : (
              <ul className="search-view__results">
                {results.map((result) => (
                  <li key={result.documentId}>
                    <Link href={`/documents/${result.slug}`}>
                      <strong>{result.title}</strong>
                      {result.matchedAlias ? (
                        <span className="search-view__alias">
                          별칭: {result.matchedAlias}
                        </span>
                      ) : null}
                      {result.matchedContext ? (
                        <SearchResultContext
                          className="search-view__match-context"
                          context={result.matchedContext}
                          query={trimmedQuery}
                        />
                      ) : result.summary ? (
                        <p>{result.summary}</p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <RecentSearchChips initial={recentSearches} />
            <div className="search-view__section">
              <h2>최근 문서</h2>
              {recentViews.length === 0 ? (
                <p className="search-view__empty">열어본 문서가 없습니다.</p>
              ) : (
                <ul className="search-view__results">
                  {recentViews.map((view) => (
                    <li key={view.documentId}>
                      <Link href={`/documents/${view.slug}`}>
                        <strong>{view.title}</strong>
                        {view.summary ? <p>{view.summary}</p> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
