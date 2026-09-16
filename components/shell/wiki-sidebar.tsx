"use client";

import { Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { hideRecentViewAction, loadMoreRecentViewsAction } from "@/app/(wiki)/search/actions";
import { groupRecentViewsByDate } from "@/features/history/group-recent-views";
import type { RecentView } from "@/features/history/types";

type WikiSidebarProps = {
  recentViews: RecentView[];
  initialHasMore: boolean;
};

export function WikiSidebar({ recentViews, initialHasMore }: WikiSidebarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loadedViews, setLoadedViews] = useState(recentViews);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Fetch-in-flight guard and mirrors of the latest state, read from inside the one
  // long-lived observer below instead of dependency-array closures — recreating the
  // observer on every loaded page caused Strict Mode's mount/unmount/remount of effects
  // to occasionally race two observer instances against the same sentinel.
  const isFetchingRef = useRef(false);
  const loadedViewsRef = useRef(loadedViews);
  const hasMoreRef = useRef(hasMore);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // The layout re-fetches page 1 on every navigation (viewing a doc reorders it to the
  // top), so any additionally-scrolled-in older pages are stale — reset to match. Adjusted
  // during render (not an effect) per https://react.dev/learn/you-might-not-need-an-effect.
  const [syncedRecentViews, setSyncedRecentViews] = useState(recentViews);
  if (recentViews !== syncedRecentViews) {
    setSyncedRecentViews(recentViews);
    setLoadedViews(recentViews);
    setHasMore(initialHasMore);
    setIsLoadingMore(false);
  }

  useEffect(() => {
    loadedViewsRef.current = loadedViews;
    // isIntersecting only re-fires on a change of state, so if the sentinel is still on
    // screen after this page's items were appended (a page too small to push it out of
    // view), re-observing forces a fresh check that keeps loading. Done here (after the
    // ref above is updated to the just-committed value), not inside the fetch's .then(),
    // so the next check always reads the current cursor instead of a stale one.
    const sentinel = sentinelRef.current;
    const observer = observerRef.current;
    if (sentinel && observer) {
      observer.unobserve(sentinel);
      observer.observe(sentinel);
    }
  }, [loadedViews]);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (!hasMoreRef.current || isFetchingRef.current) return;
        const before = loadedViewsRef.current[loadedViewsRef.current.length - 1]?.lastViewedAt;
        if (!before) return;

        isFetchingRef.current = true;
        setIsLoadingMore(true);
        void loadMoreRecentViewsAction(before).then((page) => {
          setLoadedViews((current) => {
            const seenIds = new Set(current.map((view) => view.documentId));
            const newViews = page.views.filter((view) => !seenIds.has(view.documentId));
            return [...current, ...newViews];
          });
          setHasMore(page.hasMore);
          setIsLoadingMore(false);
          isFetchingRef.current = false;
        });
      },
      { root: sentinel.closest(".wiki-sidebar__scroll"), rootMargin: "120px" },
    );
    observerRef.current = observer;
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, []);

  const groups = groupRecentViewsByDate(loadedViews);

  const hide = (documentId: string) => {
    startTransition(async () => {
      await hideRecentViewAction(documentId);
      router.refresh();
    });
  };

  return (
    <aside className="wiki-sidebar" aria-label="문서 탐색">
      <div className="wiki-sidebar__inner">
        <h2 className="sidebar-heading">최근 문서</h2>
        <div className="wiki-sidebar__scroll">
          {loadedViews.length === 0 ? (
            <p className="sidebar-empty">열어본 문서가 없습니다.</p>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="sidebar-group">
                <h3 className="sidebar-group-label">{group.label}</h3>
                <ul className="sidebar-documents">
                  {group.views.map((view) => (
                    <li key={view.documentId}>
                      <Link href={`/documents/${view.slug}`} title={view.title}>
                        {view.title}
                      </Link>
                      <button
                        type="button"
                        className="sidebar-documents__remove"
                        aria-label={`${view.title} 최근 문서에서 제거`}
                        disabled={isPending}
                        onClick={() => hide(view.documentId)}
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          <div ref={sentinelRef} className="wiki-sidebar__sentinel" aria-hidden="true" />
          {isLoadingMore ? <p className="sidebar-loading-more">불러오는 중…</p> : null}
        </div>
        <Link className="sidebar-utility-link" href="/trash">
          <Trash2 size={15} aria-hidden="true" />
          휴지통
        </Link>
      </div>
    </aside>
  );
}
