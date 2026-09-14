import { FileText, Plus } from "lucide-react";
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
          <Link className="primary-button" href="/documents/new">
            <Plus size={17} aria-hidden="true" />새 문서
          </Link>
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
                  <strong>{document.title}</strong>
                  {document.summary ? <span>{document.summary}</span> : null}
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
