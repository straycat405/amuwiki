"use client";

import { Code2, Eye, FileText, Image as ImageIcon, Save } from "lucide-react";
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
import { isAllowedImportFile, parseImportFile } from "@/features/imports/parse";
import { convertClipboardHtmlToMarkdown } from "@/lib/markdown/html-to-markdown";

type EditorDocument = {
  title: string;
  summary: string;
  bodyMarkdown: string;
  version: number;
};

type SaveState = "saving" | "local" | "server" | "new";

const SAVE_STATE_LABEL: Record<SaveState, string> = {
  saving: "저장 중",
  local: "이 브라우저에 임시 저장됨",
  server: "서버에 저장됨",
  new: "아직 저장 전",
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
  const [documentAtLastSync, setDocumentAtLastSync] = useState(initialDocument);
  const [showRestoredNotice, setShowRestoredNotice] = useState(false);
  const savedSnapshot = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textFileInputRef = useRef<HTMLInputElement>(null);
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

    const changedFromServer =
      restoredDocument &&
      (restoredDocument.title !== initialDocument.title ||
        restoredDocument.summary !== initialDocument.summary ||
        restoredDocument.bodyMarkdown !== initialDocument.bodyMarkdown);

    const timer = window.setTimeout(() => {
      if (restoredDocument) setDocument(restoredDocument);
      if (changedFromServer) setShowRestoredNotice(true);
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

  // useActionState는 서버 액션이 끝날 때만 state를 새 객체로 바꿔준다. 렌더 중에
  // 직전 렌더의 state와 비교해 "방금 성공했다"를 판단하면, useEffect에서 처리할 때
  // 생기는 한 프레임짜리 낡은 저장 상태 표시를 피할 수 있다.
  const [lastHandledState, setLastHandledState] = useState(initialState);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state.status === "success") {
      setDocumentAtLastSync(document);
      setShowRestoredNotice(false);
    }
  }

  useEffect(() => {
    if (state.status !== "success") return;
    savedSnapshot.current = JSON.stringify({ ...document, version: currentVersion });
    window.localStorage.removeItem(storageKey);
    if (state.redirectTo) router.push(state.redirectTo as Route);
  }, [currentVersion, document, router, state, storageKey]);

  const discardRestoredDraft = useCallback(() => {
    window.localStorage.removeItem(storageKey);
    setDocument(initialDocument);
    setShowRestoredNotice(false);
  }, [initialDocument, storageKey]);

  const isDirty =
    hydrated &&
    (document.title !== documentAtLastSync.title ||
      document.summary !== documentAtLastSync.summary ||
      document.bodyMarkdown !== documentAtLastSync.bodyMarkdown);

  const saveState: SaveState = pending
    ? "saving"
    : isDirty
      ? "local"
      : mode === "create" && state.status !== "success"
        ? "new"
        : "server";

  const insertAtCursor = useCallback((snippet: string, cursorOffset = snippet.length) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? document.bodyMarkdown.length;
    const end = textarea?.selectionEnd ?? document.bodyMarkdown.length;
    setDocument((current) => {
      return {
        ...current,
        bodyMarkdown:
          current.bodyMarkdown.slice(0, start) +
          snippet +
          current.bodyMarkdown.slice(end),
      };
    });
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + cursorOffset, start + cursorOffset);
    });
  }, [document.bodyMarkdown.length]);

  const insertCodeBlock = useCallback(() => {
    const textarea = textareaRef.current;
    const selected = textarea
      ? document.bodyMarkdown.slice(textarea.selectionStart, textarea.selectionEnd)
      : "";
    const prefix = document.bodyMarkdown && !document.bodyMarkdown.endsWith("\n") ? "\n\n" : "";
    const snippet = `${prefix}\`\`\`\n${selected}\n\`\`\`\n`;
    insertAtCursor(snippet, prefix.length + 4);
  }, [document.bodyMarkdown, insertAtCursor]);

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
    if (images.length > 0) {
      event.preventDefault();
      void uploadFiles(images);
      return;
    }

    const html = event.clipboardData?.getData("text/html");
    if (!html) return;
    const markdown = convertClipboardHtmlToMarkdown(html);
    if (!markdown) return;
    event.preventDefault();
    insertAtCursor(markdown);
  };

  const loadTextFile = useCallback(
    async (file: File) => {
      if (!isAllowedImportFile(file.name)) {
        setUploadStatus("지원하지 않는 파일 형식입니다(.md, .markdown, .txt만 가능).");
        return;
      }
      const raw = await file.text();
      const { title, content } = parseImportFile(file.name, raw);
      setDocument((current) => ({
        ...current,
        title: current.title.trim() ? current.title : title,
      }));
      insertAtCursor(`${content}\n`);
      setUploadStatus(null);
    },
    [insertAtCursor],
  );

  return (
    <form action={formAction} className="document-editor">
      <input name="version" type="hidden" value={currentVersion} />
      {mode === "create" ? (
        <input name="draftDocumentId" type="hidden" value={draftDocumentId ?? ""} />
      ) : null}
      <header className="document-editor__toolbar">
        <span>{mode === "create" ? "새 문서" : "문서 편집"}</span>
        <div className="document-editor__status-group">
          <span className={`save-state save-state--${saveState}`} aria-live="polite">
            {SAVE_STATE_LABEL[saveState]}
          </span>
          {uploadStatus ?? state.message ? (
            <span className="document-editor__status" aria-live="polite">
              {uploadStatus ?? state.message}
            </span>
          ) : null}
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
        <input
          ref={textFileInputRef}
          accept=".md,.markdown,.txt"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void loadTextFile(file);
          }}
          type="file"
        />
        <button
          className="secondary-button"
          onClick={() => textFileInputRef.current?.click()}
          type="button"
        >
          <FileText size={16} aria-hidden="true" />
          파일 불러오기
        </button>
        <button className="secondary-button" onClick={insertCodeBlock} type="button">
          <Code2 size={16} aria-hidden="true" />
          코드
        </button>
        <button className="primary-button" disabled={pending} type="submit">
          <Save size={16} aria-hidden="true" />
          {pending ? "저장 중" : "저장"}
        </button>
      </header>
      <div className="document-editor__panes">
        <section className="editor-pane" aria-label="Markdown 편집">
          {showRestoredNotice ? (
            <p className="document-editor__restored-notice" role="status">
              <span>이전에 작성하던 임시 내용을 이 브라우저에서 불러왔습니다.</span>
              <button onClick={discardRestoredDraft} type="button">
                비우고 새로 시작
              </button>
            </p>
          ) : null}
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
            placeholder="제목을 쓰고 [[관련 문서]]로 연결해 보세요. 이미지를 붙여넣거나 위 버튼으로 올릴 수 있습니다."
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
