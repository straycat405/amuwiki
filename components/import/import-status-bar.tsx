"use client";

import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import Link from "next/link";

import { useImportProgress } from "@/components/import/import-progress-provider";

export function ImportStatusBar() {
  const { state, dismiss } = useImportProgress();

  if (state.phase === "idle" || state.dismissed) return null;

  const resolved = state.counts
    ? state.counts.imported + state.counts.skipped + state.counts.failed
    : 0;
  const percent = state.total > 0 ? Math.round((resolved / state.total) * 100) : 0;

  return (
    <div className="import-status-bar" role="status" aria-live="polite">
      <div className="import-status-bar__icon">
        {state.phase === "committing" ? (
          <Loader2 size={16} className="import-status-bar__spinner" aria-hidden="true" />
        ) : state.phase === "error" ? (
          <XCircle size={16} aria-hidden="true" />
        ) : (
          <CheckCircle2 size={16} aria-hidden="true" />
        )}
      </div>

      <div className="import-status-bar__body">
        <span className="import-status-bar__title">
          {state.phase === "committing" && `가져오는 중... ${resolved}/${state.total || "?"}`}
          {state.phase === "done" &&
            state.result &&
            `가져오기 완료 — 가져옴 ${state.result.imported} · 건너뜀 ${state.result.skipped} · 실패 ${state.result.failed}`}
          {state.phase === "error" && (state.message ?? "가져오기에 실패했습니다.")}
        </span>
        {state.phase === "committing" && state.total > 0 ? (
          <div className="import-status-bar__track">
            <div className="import-status-bar__fill" style={{ width: `${percent}%` }} />
          </div>
        ) : null}
        {state.phase === "committing" && state.attempt > 1 ? (
          <span className="import-status-bar__hint">재시도 {state.attempt}회째 — 이어서 진행 중</span>
        ) : null}
      </div>

      {state.phase !== "committing" ? (
        <div className="import-status-bar__actions">
          {state.phase === "error" ? (
            <Link href="/settings/import" className="import-status-bar__link">
              다시 시도
            </Link>
          ) : null}
          <button
            type="button"
            className="import-status-bar__dismiss"
            onClick={dismiss}
            aria-label="닫기"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
