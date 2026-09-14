import { Trash2 } from "lucide-react";

import { restoreDocumentAction } from "@/app/(wiki)/documents/actions";
import { DocumentLifecycleButton } from "@/components/document/document-lifecycle-button";
import { listDeletedDocuments } from "@/features/documents/data";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

export default async function TrashPage() {
  const user = await requireOwner();
  const supabase = await createClient();
  const documents = await listDeletedDocuments(supabase, user.id);

  return (
    <main className="document-stage document-stage--reading" id="main-content">
      <section className="trash-view" aria-labelledby="trash-title">
        <header className="trash-view__header">
          <Trash2 size={22} aria-hidden="true" />
          <h1 id="trash-title">휴지통</h1>
        </header>
        {documents.length === 0 ? (
          <p className="trash-empty">휴지통이 비어 있습니다.</p>
        ) : (
          <ul className="trash-list">
            {documents.map((document) => (
              <li key={document.id}>
                <div>
                  <strong>{document.title}</strong>
                  <time dateTime={document.deleted_at}>
                    {new Intl.DateTimeFormat("ko-KR", {
                      dateStyle: "medium",
                    }).format(new Date(document.deleted_at))}
                  </time>
                </div>
                <DocumentLifecycleButton
                  action={restoreDocumentAction.bind(
                    null,
                    document.id,
                    document.version,
                  )}
                  kind="restore"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
