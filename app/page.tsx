import { FileText, Plus } from "lucide-react";

import { AppHeader } from "@/components/shell/app-header";
import { SiteFooter } from "@/components/shell/site-footer";
import { WikiSidebar } from "@/components/shell/wiki-sidebar";

export default function HomePage() {
  return (
    <div className="app-shell">
      <AppHeader />
      <WikiSidebar />
      <main className="document-stage" id="main-content">
        <section className="empty-document" aria-labelledby="empty-title">
          <span className="empty-document__icon" aria-hidden="true">
            <FileText size={24} strokeWidth={1.7} />
          </span>
          <h1 id="empty-title">아직 문서가 없습니다</h1>
          <button className="primary-button" type="button">
            <Plus size={17} aria-hidden="true" />
            새 문서
          </button>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
