"use client";

import { AlertTriangle, FileArchive, FileUp, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { MarkdownRenderer } from "@/components/document/markdown-renderer";
import type {
  ImportAnalysis,
  ImportCommitResult,
} from "@/features/imports/types";

type Phase = "select" | "analyzing" | "review" | "committing" | "done";
type UploadMode = "files" | "zip";

const WARNING_LABELS: Record<string, string> = {
  duplicate_title_in_batch: "선택한 파일들 안에서 제목이 중복됩니다.",
  duplicate_title_existing: "이미 있는 문서·별칭과 제목이 겹칩니다.",
  unsupported_extension: "지원하지 않는 파일 형식입니다(.md, .markdown, .txt만 가능).",
  file_too_large: "파일이 너무 큽니다(5MB 제한).",
  upload_failed: "파일을 업로드하지 못했습니다.",
};

export function ImportWizard() {
  const [phase, setPhase] = useState<Phase>("select");
  const [uploadMode, setUploadMode] = useState<UploadMode>("files");
  const [files, setFiles] = useState<File[]>([]);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [isObsidianVault, setIsObsidianVault] = useState(false);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [conflictPolicy, setConflictPolicy] = useState<"skip" | "rename">("skip");
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const analyze = async () => {
    if (uploadMode === "files" && files.length === 0) return;
    if (uploadMode === "zip" && !zipFile) return;
    setError(null);
    setPhase("analyzing");
    const body = new FormData();
    if (uploadMode === "zip" && zipFile) {
      body.append("zip", zipFile);
      body.append("sourceKind", isObsidianVault ? "obsidian-vault" : "markdown-zip");
    } else {
      files.forEach((file) => body.append("files", file));
    }
    try {
      const response = await fetch("/api/imports", { method: "POST", body });
      const payload = (await response.json()) as ImportAnalysis & {
        message?: string;
      };
      if (!response.ok) {
        setError(payload.message ?? "분석에 실패했습니다.");
        setPhase("select");
        return;
      }
      setAnalysis(payload);
      setPhase("review");
    } catch {
      setError("분석에 실패했습니다.");
      setPhase("select");
    }
  };

  const commit = async () => {
    if (!analysis) return;
    setError(null);
    setPhase("committing");
    try {
      const response = await fetch(`/api/imports/${analysis.jobId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conflictPolicy }),
      });
      const payload = (await response.json()) as ImportCommitResult & {
        message?: string;
      };
      if (!response.ok) {
        setError(payload.message ?? "가져오기에 실패했습니다.");
        setPhase("review");
        return;
      }
      setResult(payload);
      setPhase("done");
    } catch {
      setError("가져오기에 실패했습니다.");
      setPhase("review");
    }
  };

  const reset = () => {
    setPhase("select");
    setFiles([]);
    setZipFile(null);
    setAnalysis(null);
    setResult(null);
    setError(null);
  };

  if (phase === "done" && result) {
    return (
      <div className="import-wizard">
        <h2>가져오기 완료</h2>
        <p className="import-wizard__summary">
          가져옴 {result.imported}건 · 건너뜀 {result.skipped}건 · 실패 {result.failed}건
          {result.attached > 0 ? ` · 첨부 연결 ${result.attached}건` : ""}
        </p>
        <ul className="import-result-list">
          {result.items.map((item) => (
            <li key={item.relativePath}>
              <span className={`import-result-badge import-result-badge--${item.status}`}>
                {item.status === "imported"
                  ? "가져옴"
                  : item.status === "skipped"
                    ? "건너뜀"
                    : "실패"}
              </span>
              {item.status === "imported" && item.slug ? (
                <Link href={`/documents/${item.slug}`}>{item.title}</Link>
              ) : (
                <span>{item.title}</span>
              )}
              <span className="import-result-path">{item.relativePath}</span>
            </li>
          ))}
        </ul>
        <button className="secondary-button" type="button" onClick={reset}>
          다른 파일 가져오기
        </button>
      </div>
    );
  }

  if (phase === "review" && analysis) {
    return (
      <div className="import-wizard">
        <h2>가져오기 미리보기</h2>
        <p className="import-wizard__summary">
          전체 {analysis.totalFiles}개 · 준비됨 {analysis.readyCount}개 · 실패{" "}
          {analysis.failedCount}개
          {analysis.duplicateInBatchCount + analysis.conflictWithExistingCount > 0
            ? ` · 제목 중복 ${analysis.duplicateInBatchCount + analysis.conflictWithExistingCount}건`
            : ""}
          {analysis.attachmentCount > 0 ? ` · 첨부파일 ${analysis.attachmentCount}개` : ""}
          {analysis.ignoredCount > 0 ? ` · 건너뛴 항목 ${analysis.ignoredCount}개` : ""}
        </p>

        <ul className="import-item-list">
          {analysis.items.map((item) => (
            <li key={item.id || item.relativePath}>
              <span
                className={`import-result-badge import-result-badge--${item.status === "ready" ? "imported" : "failed"}`}
              >
                {item.status === "ready" ? "준비됨" : "실패"}
              </span>
              <span>{item.detectedTitle}</span>
              <span className="import-result-path">{item.relativePath}</span>
              {item.warningCodes.length > 0 ? (
                <span className="import-item-warning">
                  <AlertTriangle size={13} aria-hidden="true" />
                  {item.warningCodes.map((code) => WARNING_LABELS[code] ?? code).join(", ")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>

        {analysis.samples.length > 0 ? (
          <div className="import-wizard__section">
            <h3>표본 미리보기 (최대 {analysis.samples.length}개)</h3>
            {analysis.samples.map((sample) => (
              <details key={sample.relativePath} className="import-sample">
                <summary>{sample.title}</summary>
                <MarkdownRenderer markdown={sample.bodyMarkdown} />
              </details>
            ))}
          </div>
        ) : null}

        <div className="import-wizard__section">
          <h3>제목이 중복되면</h3>
          <div className="settings-options" role="radiogroup" aria-label="충돌 정책">
            <label
              className={
                "settings-option" + (conflictPolicy === "skip" ? " settings-option--active" : "")
              }
            >
              <input
                type="radio"
                name="conflictPolicy"
                checked={conflictPolicy === "skip"}
                onChange={() => setConflictPolicy("skip")}
              />
              건너뛰기
            </label>
            <label
              className={
                "settings-option" +
                (conflictPolicy === "rename" ? " settings-option--active" : "")
              }
            >
              <input
                type="radio"
                name="conflictPolicy"
                checked={conflictPolicy === "rename"}
                onChange={() => setConflictPolicy("rename")}
              />
              이름 바꿔서 가져오기
            </label>
          </div>
        </div>

        {error ? <p className="settings-status settings-status--error">{error}</p> : null}

        <div className="import-wizard__actions">
          <button className="secondary-button" type="button" onClick={reset}>
            취소
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={phase !== "review" || analysis.readyCount === 0}
            onClick={commit}
          >
            <Upload size={16} aria-hidden="true" />
            가져오기 실행
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="import-wizard">
      <div className="settings-options" role="radiogroup" aria-label="가져오기 방식">
        <label className={"settings-option" + (uploadMode === "files" ? " settings-option--active" : "")}>
          <input
            type="radio"
            name="uploadMode"
            checked={uploadMode === "files"}
            onChange={() => setUploadMode("files")}
          />
          여러 파일
        </label>
        <label className={"settings-option" + (uploadMode === "zip" ? " settings-option--active" : "")}>
          <input
            type="radio"
            name="uploadMode"
            checked={uploadMode === "zip"}
            onChange={() => setUploadMode("zip")}
          />
          ZIP (Markdown 폴더 · Obsidian vault)
        </label>
      </div>

      {uploadMode === "files" ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".md,.markdown,.txt"
            multiple
            className="visually-hidden"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
          <button
            className="import-dropzone"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={phase === "analyzing"}
          >
            <FileUp size={28} aria-hidden="true" />
            <span>
              {files.length > 0
                ? `${files.length}개 파일 선택됨`
                : "클릭해서 .md, .markdown, .txt 파일 선택 (여러 개 가능)"}
            </span>
          </button>
        </>
      ) : (
        <>
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip"
            className="visually-hidden"
            onChange={(event) => setZipFile(event.target.files?.[0] ?? null)}
          />
          <button
            className="import-dropzone"
            type="button"
            onClick={() => zipInputRef.current?.click()}
            disabled={phase === "analyzing"}
          >
            <FileArchive size={28} aria-hidden="true" />
            <span>{zipFile ? zipFile.name : "클릭해서 .zip 파일 선택 (최대 250MB)"}</span>
          </button>
          <label className="settings-option">
            <input
              type="checkbox"
              checked={isObsidianVault}
              onChange={(event) => setIsObsidianVault(event.target.checked)}
            />
            Obsidian vault입니다 (.obsidian 폴더는 항상 제외됩니다)
          </label>
        </>
      )}

      {error ? <p className="settings-status settings-status--error">{error}</p> : null}

      <button
        className="primary-button"
        type="button"
        disabled={
          (uploadMode === "files" ? files.length === 0 : !zipFile) || phase === "analyzing"
        }
        onClick={analyze}
      >
        {phase === "analyzing" ? "분석 중..." : "분석하기"}
      </button>
    </div>
  );
}
