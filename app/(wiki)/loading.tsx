import { Plus } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

const ROW_WIDTHS = [
  { title: "72%", summary: "88%" },
  { title: "54%", summary: "66%" },
  { title: "80%", summary: "40%" },
  { title: "62%", summary: "76%" },
  { title: "45%", summary: "58%" },
  { title: "70%", summary: "84%" },
];

export default function Loading() {
  return (
    <main className="document-stage" id="main-content">
      <section className="document-index" aria-busy="true" aria-label="문서 목록 불러오는 중">
        <div className="document-index__header">
          <h1>문서</h1>
          <span className="primary-button" aria-hidden="true" style={{ opacity: 0.5, pointerEvents: "none" }}>
            <Plus size={17} aria-hidden="true" />새 문서
          </span>
        </div>
        <ul className="document-list">
          {ROW_WIDTHS.map((row, index) => (
            <li key={index}>
              <div className="document-list__row--skeleton">
                <Skeleton className="skeleton--icon" />
                <Skeleton className="skeleton--line-lg" width={row.title} />
                <Skeleton className="skeleton--line" width={row.summary} />
                <Skeleton className="skeleton--line" width="64px" />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
