"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { createAiDraftDocumentAction } from "@/app/(wiki)/documents/actions";
import { MarkdownRenderer } from "@/components/document/markdown-renderer";

type Props = {
  slug: string;
  pageSlug: string | null;
};

type Phase = "idle" | "streaming" | "done" | "error";

export function AskInCard({ slug, pageSlug }: Props) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const abortRef = useRef<AbortController | null>(null);

  async function ask() {
    const trimmed = question.trim();
    if (!trimmed || phase === "streaming") return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAskedQuestion(trimmed);
    setAnswer("");
    setError(null);
    setPhase("streaming");

    try {
      const response = await fetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, question: trimmed, pageSlug }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "답변을 받지 못했습니다.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setAnswer(text);
      }
      text += decoder.decode();
      setAnswer(text);
      setPhase("done");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "답변을 받지 못했습니다.");
      setPhase("error");
    }
  }

  function saveAsDocument() {
    startSaving(async () => {
      const result = await createAiDraftDocumentAction({
        question: askedQuestion,
        answer,
        sourceSlug: slug,
        pageSlug,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/documents/${encodeURIComponent(result.slug)}/edit`);
    });
  }

  return (
    <div className="ask-card">
      <form
        className="ask-card__form"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <label className="visually-hidden" htmlFor={`ask-${slug}`}>
          이 문서에 대해 물어보기
        </label>
        <textarea
          id={`ask-${slug}`}
          className="ask-card__input"
          disabled={phase === "streaming"}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void ask();
            }
          }}
          placeholder="이 문서에 대해 물어보기"
          rows={1}
          value={question}
        />
        <button
          aria-label="물어보기"
          className="ask-card__submit"
          disabled={phase === "streaming" || question.trim().length === 0}
          type="submit"
        >
          <Sparkles size={15} aria-hidden="true" />
        </button>
      </form>

      {phase !== "idle" ? (
        <div className="ask-card__answer" aria-live="polite">
          {answer ? (
            <MarkdownRenderer markdown={answer} />
          ) : phase === "streaming" ? (
            <p className="ask-card__status">생각하는 중…</p>
          ) : null}
          {error ? (
            <p className="ask-card__status ask-card__status--error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {phase === "done" && answer.trim() ? (
        <div className="ask-card__actions">
          <button className="secondary-button" disabled={saving} onClick={saveAsDocument} type="button">
            {saving ? "만드는 중…" : "문서로 저장"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
