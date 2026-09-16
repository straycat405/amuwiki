import { FileText, Plus, Upload } from "lucide-react";
import Link from "next/link";

import { listDocuments } from "@/features/documents/data";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const user = await requireOwner();
  const supabase = await createClient();
  const documents = await listDocuments(supabase, user.id);

  return (
    <main className="document-stage" id="main-content">
      {documents.length === 0 ? (
        <section className="empty-document" aria-labelledby="empty-title">
          <span className="empty-document__icon" aria-hidden="true">
            <FileText size={24} strokeWidth={1.7} />
          </span>
          <h1 id="empty-title">아직 문서가 없습니다</h1>
          <p className="empty-document__lede">
            Markdown으로 기록하고 문서 안에서 <code>[[개념]]</code>을 연결해 두면, 클릭했을 때
            현재 자리를 떠나지 않고 카드로 이어서 읽을 수 있습니다.
          </p>
          <div className="empty-document__actions">
            <Link className="primary-button" href="/documents/new">
              <Plus size={17} aria-hidden="true" />새 문서 작성
            </Link>
            <Link className="secondary-button" href="/settings/import">
              <Upload size={17} aria-hidden="true" />
              Markdown 가져오기
            </Link>
          </div>
          <div aria-hidden="true" className="empty-document__example">
            <div className="example-card example-card--source">
              <p className="example-card__label">문서 예시</p>
              <p>
                후속 개념: <span className="example-card__link">[[카드 탐색]]</span>
              </p>
            </div>
            <div className="example-card example-card--popup">
              <p className="example-card__label">클릭하면 여기서 열림</p>
              <p>현재 문서를 떠나지 않고 관련 내용을 바로 확인합니다.</p>
            </div>
          </div>
        </section>
      ) : (
        <section
          className="document-index"
          aria-labelledby="document-index-title"
        >
          <div className="document-index__header">
            <h1 id="document-index-title">문서</h1>
            <Link className="primary-button" href="/documents/new">
              <Plus size={17} aria-hidden="true" />새 문서
            </Link>
          </div>
          <ul className="document-list">
            {documents.map((document) => (
              <li key={document.id}>
                <Link href={`/documents/${document.slug}`}>
                  <span className="document-list__icon" aria-hidden="true">
                    <FileText size={15} strokeWidth={1.8} />
                  </span>
                  <strong>{document.title}</strong>
                  {document.summary ? (
                    <span className="document-list__summary">{document.summary}</span>
                  ) : (
                    <span className="document-list__summary document-list__empty">
                      요약 없음
                    </span>
                  )}
                  <time dateTime={document.updated_at}>
                    {new Intl.DateTimeFormat("ko-KR", {
                      dateStyle: "medium",
                    }).format(new Date(document.updated_at))}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
