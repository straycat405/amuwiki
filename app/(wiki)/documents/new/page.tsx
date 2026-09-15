import { createDocumentAction } from "@/app/(wiki)/documents/actions";
import { DocumentEditor } from "@/components/document/document-editor";
import { initialDocumentActionState } from "@/features/documents/action-state";

export default async function NewDocumentPage({ searchParams }: PageProps<"/documents/new">) {
  const params = await searchParams;
  const rawTitle = Array.isArray(params.title) ? params.title[0] : params.title;
  const title = (rawTitle ?? "").trim().slice(0, 200);

  return (
    <main className="document-stage document-stage--editor" id="main-content">
      <DocumentEditor
        action={createDocumentAction}
        draftKey={title ? `new:${title}` : "new"}
        initialDocument={{ title, summary: "", bodyMarkdown: "", version: 1 }}
        initialState={initialDocumentActionState}
        mode="create"
      />
    </main>
  );
}
