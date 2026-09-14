"use client";

import { Eye, Save } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { MarkdownRenderer } from "@/components/document/markdown-renderer";
import type { DocumentActionState } from "@/features/documents/action-state";

type EditorDocument = {
  title: string;
  summary: string;
  bodyMarkdown: string;
  version: number;
};

type DocumentEditorProps = {
  action: (
    state: DocumentActionState,
    formData: FormData,
  ) => Promise<DocumentActionState>;
  draftKey: string;
  initialDocument?: EditorDocument;
  initialState: DocumentActionState;
  mode: "create" | "update";
};

const emptyDocument: EditorDocument = {
  title: "",
  summary: "",
  bodyMarkdown: "",
  version: 1,
};

export function DocumentEditor({
  action,
  draftKey,
  initialDocument = emptyDocument,
  initialState,
  mode,
}: DocumentEditorProps) {
  const router = useRouter();
  const storageKey = `amuwiki:draft:${draftKey}`;
  const [document, setDocument] = useState(initialDocument);
  const [hydrated, setHydrated] = useState(false);
  const savedSnapshot = useRef("");
  const [state, formAction, pending] = useActionState(action, initialState);
  const currentVersion = state.savedVersion ?? document.version;

  useEffect(() => {
    let restoredDocument: EditorDocument | null = null;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const draft = JSON.parse(saved) as Partial<EditorDocument>;
        if (draft.version === initialDocument.version) {
          restoredDocument = { ...initialDocument, ...draft };
        }
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }

    const timer = window.setTimeout(() => {
      if (restoredDocument) setDocument(restoredDocument);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialDocument, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      const snapshot = JSON.stringify({ ...document, version: currentVersion });
      if (snapshot !== savedSnapshot.current) {
        window.localStorage.setItem(storageKey, snapshot);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [currentVersion, document, hydrated, storageKey]);

  useEffect(() => {
    if (state.status !== "success") return;
    savedSnapshot.current = JSON.stringify({ ...document, version: currentVersion });
    window.localStorage.removeItem(storageKey);
    if (state.redirectTo) router.push(state.redirectTo as Route);
  }, [currentVersion, document, router, state, storageKey]);

  return (
    <form action={formAction} className="document-editor">
      <input name="version" type="hidden" value={currentVersion} />
      <header className="document-editor__toolbar">
        <span>{mode === "create" ? "새 문서" : "문서 편집"}</span>
        <div className="document-editor__status" aria-live="polite">
          {state.message}
        </div>
        <button className="primary-button" disabled={pending} type="submit">
          <Save size={16} aria-hidden="true" />
          {pending ? "저장 중" : "저장"}
        </button>
      </header>
      <div className="document-editor__panes">
        <section className="editor-pane" aria-label="Markdown 편집">
          <label className="visually-hidden" htmlFor="document-title">
            제목
          </label>
          <input
            className="document-title-input"
            id="document-title"
            maxLength={200}
            name="title"
            onChange={(event) =>
              setDocument({ ...document, title: event.target.value })
            }
            placeholder="제목"
            required
            value={document.title}
          />
          {state.fieldErrors?.title ? (
            <p className="field-error">{state.fieldErrors.title[0]}</p>
          ) : null}
          <label className="visually-hidden" htmlFor="document-summary">
            요약
          </label>
          <input
            className="document-summary-input"
            id="document-summary"
            maxLength={300}
            name="summary"
            onChange={(event) =>
              setDocument({ ...document, summary: event.target.value })
            }
            placeholder="요약 (선택)"
            value={document.summary}
          />
          <label className="visually-hidden" htmlFor="document-body">
            본문
          </label>
          <textarea
            autoFocus={mode === "update"}
            id="document-body"
            name="bodyMarkdown"
            onChange={(event) =>
              setDocument({ ...document, bodyMarkdown: event.target.value })
            }
            placeholder="Markdown으로 기록하세요."
            value={document.bodyMarkdown}
          />
        </section>
        <section className="preview-pane" aria-label="문서 미리보기">
          <div className="preview-pane__label">
            <Eye size={15} aria-hidden="true" />
            미리보기
          </div>
          {document.bodyMarkdown ? (
            <MarkdownRenderer markdown={document.bodyMarkdown} />
          ) : (
            <p className="preview-empty">본문 미리보기가 여기에 표시됩니다.</p>
          )}
        </section>
      </div>
    </form>
  );
}
