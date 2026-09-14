import { createDocumentAction } from "@/app/(wiki)/documents/actions";
import { DocumentEditor } from "@/components/document/document-editor";
import { initialDocumentActionState } from "@/features/documents/action-state";

export default function NewDocumentPage() {
  return (
    <main className="document-stage document-stage--editor" id="main-content">
      <DocumentEditor
        action={createDocumentAction}
        draftKey="new"
        initialState={initialDocumentActionState}
        mode="create"
      />
    </main>
  );
}
