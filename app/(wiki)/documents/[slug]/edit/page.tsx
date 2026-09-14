import { notFound } from "next/navigation";

import { updateDocumentAction } from "@/app/(wiki)/documents/actions";
import { DocumentEditor } from "@/components/document/document-editor";
import { initialDocumentActionState } from "@/features/documents/action-state";
import { getDocumentBySlug } from "@/features/documents/data";
import { requireOwner } from "@/lib/auth/require-owner";
import { decodeDocumentSlug } from "@/lib/markdown/slug";
import { createClient } from "@/lib/supabase/server";

export default async function EditDocumentPage({
  params,
}: PageProps<"/documents/[slug]/edit">) {
  const { slug: encodedSlug } = await params;
  const slug = decodeDocumentSlug(encodedSlug);
  if (!slug) notFound();
  const user = await requireOwner();
  const supabase = await createClient();
  const document = await getDocumentBySlug(supabase, user.id, slug);
  if (!document) notFound();

  return (
    <main className="document-stage document-stage--editor" id="main-content">
      <DocumentEditor
        action={updateDocumentAction.bind(null, document.id)}
        documentId={document.id}
        draftKey={document.id}
        initialDocument={{
          title: document.title,
          summary: document.summary,
          bodyMarkdown: document.body_markdown,
          version: document.version,
        }}
        initialState={initialDocumentActionState}
        mode="update"
      />
    </main>
  );
}
