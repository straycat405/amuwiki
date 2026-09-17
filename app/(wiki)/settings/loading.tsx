import { Settings } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

const SECTION_COUNT = 4;

export default function Loading() {
  return (
    <main className="document-stage document-stage--reading" id="main-content">
      <section className="settings-view" aria-busy="true" aria-label="설정 불러오는 중">
        <header className="settings-view__header">
          <Settings size={22} aria-hidden="true" />
          <h1>설정</h1>
        </header>
        {Array.from({ length: SECTION_COUNT }).map((_, index) => (
          <div className="settings-view__skeleton-section" key={index}>
            <Skeleton className="skeleton--line-lg" width="30%" />
            <Skeleton className="skeleton--line" width="70%" />
            <Skeleton className="skeleton--line" height="34px" width="120px" />
          </div>
        ))}
      </section>
    </main>
  );
}
