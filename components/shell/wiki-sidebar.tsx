"use client";

import { Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { hideRecentViewAction } from "@/app/(wiki)/search/actions";
import { groupRecentViewsByDate } from "@/features/history/group-recent-views";
import type { RecentView } from "@/features/history/types";

export function WikiSidebar({ recentViews }: { recentViews: RecentView[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const groups = groupRecentViewsByDate(recentViews);

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
        {recentViews.length === 0 ? (
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
        <Link className="sidebar-utility-link" href="/trash">
          <Trash2 size={15} aria-hidden="true" />
          휴지통
        </Link>
      </div>
    </aside>
  );
}
