import { Pencil } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

const BODY_LINE_WIDTHS = ["94%", "88%", "97%", "62%", "80%", "70%"];

export default function Loading() {
  return (
    <main className="document-stage document-stage--reading" id="main-content">
      <article className="document-view" aria-busy="true" aria-label="문서 불러오는 중">
        <header className="document-view__header">
          <div>
            <Skeleton className="skeleton--title" width="60%" />
            <Skeleton className="skeleton--line document-view__updated-at" width="140px" />
          </div>
          <div className="document-view__actions" aria-hidden="true">
            <span className="secondary-button" style={{ opacity: 0.5, pointerEvents: "none" }}>
              <Pencil size={16} aria-hidden="true" />
              편집
            </span>
          </div>
        </header>
        <div className="document-view__skeleton-body">
          {BODY_LINE_WIDTHS.map((width, index) => (
            <Skeleton className="skeleton--line" key={index} width={width} />
          ))}
        </div>
      </article>
    </main>
  );
}
