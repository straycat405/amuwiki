"use client";

import { Eye, Image as ImageIcon, Save } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
} from "react";

import { createDraftDocumentAction } from "@/app/(wiki)/documents/actions";
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
  documentId?: string;
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
  documentId,
  draftKey,
  initialDocument = emptyDocument,
  initialState,
  mode,
}: DocumentEditorProps) {
  const router = useRouter();
  const storageKey = `amuwiki:draft:${draftKey}`;
  const [document, setDocument] = useState(initialDocument);
  const [hydrated, setHydrated] = useState(false);
  const [draftDocumentId, setDraftDocumentId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const savedSnapshot = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(action, initialState);
  const currentVersion = state.savedVersion ?? document.version;
  const effectiveDocumentId = documentId ?? draftDocumentId ?? undefined;

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

  const insertAtCursor = useCallback((snippet: string) => {
    const textarea = textareaRef.current;
    setDocument((current) => {
      const start = textarea?.selectionStart ?? current.bodyMarkdown.length;
      const end = textarea?.selectionEnd ?? current.bodyMarkdown.length;
      return {
        ...current,
        bodyMarkdown:
          current.bodyMarkdown.slice(0, start) +
          snippet +
          current.bodyMarkdown.slice(end),
      };
    });
  }, []);

  const ensureDocumentId = useCallback(async (): Promise<string | null> => {
    if (effectiveDocumentId) return effectiveDocumentId;
    const result = await createDraftDocumentAction(document.title);
    if (!result.ok) {
      setUploadStatus(result.message);
      return null;
    }
    setDraftDocumentId(result.id);
    return result.id;
  }, [document.title, effectiveDocumentId]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((file) => file.type.startsWith("image/"));
      if (images.length === 0) return;

      const targetId = await ensureDocumentId();
      if (!targetId) return;

      let uploaded = 0;
      for (const file of images) {
        setUploadStatus(`이미지 업로드 중 (${uploaded + 1}/${images.length})`);
        const body = new FormData();
        body.set("file", file);
        body.set("documentId", targetId);
        try {
          const response = await fetch("/api/attachments", {
            method: "POST",
            body,
          });
          const payload = (await response.json()) as {
            url?: string;
            message?: string;
          };
          if (!response.ok || !payload.url) {
            setUploadStatus(payload.message ?? "이미지를 업로드하지 못했습니다.");
            continue;
          }
          insertAtCursor(`![${file.name}](${payload.url})\n`);
          uploaded += 1;
        } catch {
          setUploadStatus("이미지를 업로드하지 못했습니다.");
        }
      }
      setUploadStatus(
        uploaded === images.length ? null : `${uploaded}/${images.length}개 업로드 완료`,
      );
    },
    [ensureDocumentId, insertAtCursor],
  );

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData?.files ?? []);
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    event.preventDefault();
    void uploadFiles(images);
  };

  return (
    <form action={formAction} className="document-editor">
      <input name="version" type="hidden" value={currentVersion} />
      {mode === "create" ? (
        <input name="draftDocumentId" type="hidden" value={draftDocumentId ?? ""} />
      ) : null}
      <header className="document-editor__toolbar">
        <span>{mode === "create" ? "새 문서" : "문서 편집"}</span>
        <div className="document-editor__status" aria-live="polite">
          {uploadStatus ?? state.message}
        </div>
        <input
          ref={fileInputRef}
          accept="image/*"
          className="visually-hidden"
          multiple
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void uploadFiles(files);
          }}
          type="file"
        />
        <button
          className="secondary-button"
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          <ImageIcon size={16} aria-hidden="true" />
          이미지
        </button>
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
            onPaste={handlePaste}
            placeholder="Markdown으로 기록하세요. 이미지를 붙여넣거나 위 버튼으로 올릴 수 있습니다."
            ref={textareaRef}
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
