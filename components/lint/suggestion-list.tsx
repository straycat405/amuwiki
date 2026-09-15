"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";

import {
  applySuggestionAction,
  dismissSuggestionAction,
  type LintActionResult,
} from "@/app/(wiki)/settings/lint/actions";
import type { Suggestion, SuggestionKind } from "@/features/lint/types";

const sections: { kind: SuggestionKind; title: string; description: string }[] = [
  {
    kind: "forward_link",
    title: "이제 연결할 수 있는 링크",
    description: "저장 당시에는 없던 문서가 생겼습니다. 적용하면 링크와 백링크가 이어집니다.",
  },
  {
    kind: "fill_summary",
    title: "요약이 없는 문서",
    description: "첫 문단에서 만든 요약입니다. 저장하면 호버 미리보기에 표시됩니다.",
  },
  {
    kind: "broken_link",
    title: "가리키는 문서가 없는 링크",
    description: "새 문서를 만들거나, 원문에서 링크를 고쳐주세요.",
  },
  {
    kind: "orphan",
    title: "연결이 없는 문서",
    description: "다른 문서와 링크로 이어지지 않은 문서입니다.",
  },
];

type Props = { suggestions: Suggestion[] };

export function SuggestionList({ suggestions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function run(id: string, action: (id: string) => Promise<LintActionResult>) {
    setBusyId(id);
    setMessage(null);
    startTransition(async () => {
      const result = await action(id);
      if (!result.ok) setMessage(result.message);
      setBusyId(null);
      router.refresh();
    });
  }

  if (suggestions.length === 0) {
    return <p className="lint-empty">정리할 항목이 없습니다.</p>;
  }

  return (
    <div className="lint-sections">
      {message ? (
        <p className="form-message form-message--error" role="alert">
          {message}
        </p>
      ) : null}
      {sections.map((section) => {
        const items = suggestions.filter((item) => item.kind === section.kind);
        if (items.length === 0) return null;
        return (
          <section key={section.kind} className="lint-section" aria-labelledby={`lint-${section.kind}`}>
            <header className="settings-section__header">
              <h2 id={`lint-${section.kind}`}>
                {section.title} <span className="lint-count">{items.length}</span>
              </h2>
              <p>{section.description}</p>
            </header>
            <ul className="lint-list">
              {items.map((item) => (
                <li key={item.id} className="lint-item">
                  <SuggestionBody item={item} />
                  <div className="lint-item__actions">
                    <SuggestionPrimaryAction
                      item={item}
                      disabled={pending && busyId === item.id}
                      onApply={() => run(item.id, applySuggestionAction)}
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={pending && busyId === item.id}
                      onClick={() => run(item.id, dismissSuggestionAction)}
                    >
                      무시
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function payloadString(item: Suggestion, key: string): string {
  const value = item.payload[key];
  return typeof value === "string" ? value : "";
}

function SuggestionBody({ item }: { item: Suggestion }) {
  const documentLink = (
    <Link href={`/documents/${encodeURIComponent(item.documentSlug)}`}>{item.documentTitle}</Link>
  );

  switch (item.kind) {
    case "forward_link":
      return (
        <p className="lint-item__text">
          {documentLink}의 <code>[[{payloadString(item, "title")}]]</code> →{" "}
          <strong>{payloadString(item, "targetTitle")}</strong>
        </p>
      );
    case "fill_summary":
      return (
        <div className="lint-item__text">
          <p>{documentLink}</p>
          {item.proposedSummary ? (
            <blockquote className="lint-proposal">{item.proposedSummary}</blockquote>
          ) : (
            <p className="lint-item__note">본문에서 요약을 만들 수 없습니다.</p>
          )}
        </div>
      );
    case "broken_link": {
      const count = item.payload.occurrenceCount;
      return (
        <p className="lint-item__text">
          {documentLink}의 <code>[[{payloadString(item, "title")}]]</code>
          {typeof count === "number" && count > 1 ? ` (${count}회)` : ""}
        </p>
      );
    }
    case "orphan":
      return <p className="lint-item__text">{documentLink}</p>;
  }
}

function SuggestionPrimaryAction({
  item,
  disabled,
  onApply,
}: {
  item: Suggestion;
  disabled: boolean;
  onApply: () => void;
}) {
  switch (item.kind) {
    case "forward_link":
      return (
        <button type="button" className="primary-button" disabled={disabled} onClick={onApply}>
          링크 연결
        </button>
      );
    case "fill_summary":
      return item.proposedSummary ? (
        <button type="button" className="primary-button" disabled={disabled} onClick={onApply}>
          요약 저장
        </button>
      ) : (
        <Link className="primary-button" href={`/documents/${encodeURIComponent(item.documentSlug)}/edit`}>
          직접 입력
        </Link>
      );
    case "broken_link":
      return (
        <Link
          className="primary-button"
          href={`/documents/new?title=${encodeURIComponent(payloadString(item, "title"))}`}
        >
          새 문서 만들기
        </Link>
      );
    case "orphan":
      return null;
  }
}
