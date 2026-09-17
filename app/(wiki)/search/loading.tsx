import { Search } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

const ROW_WIDTHS = [
  { title: "58%", body: "82%" },
  { title: "70%", body: "48%" },
  { title: "44%", body: "66%" },
  { title: "62%", body: "90%" },
];

export default function Loading() {
  return (
    <main className="document-stage document-stage--reading" id="main-content">
      <section className="search-view" aria-busy="true" aria-label="검색 결과 불러오는 중">
        <header className="search-view__header">
          <Search size={22} aria-hidden="true" />
          <h1>검색</h1>
        </header>
        <div className="search-view__form" aria-hidden="true">
          <Skeleton className="skeleton--line-lg" style={{ flex: 1 }} />
        </div>
        <ul className="search-view__results">
          {ROW_WIDTHS.map((row, index) => (
            <li key={index}>
              <div className="search-view__row--skeleton">
                <Skeleton className="skeleton--line-lg" width={row.title} />
                <Skeleton className="skeleton--line" width={row.body} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
