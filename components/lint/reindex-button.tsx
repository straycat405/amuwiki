"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { reindexAllDocumentsAction } from "@/app/(wiki)/settings/lint/actions";

export function ReindexButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="lint-toolbar">
      <button
        type="button"
        className="secondary-button"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await reindexAllDocumentsAction();
            if (!result.ok) setMessage(result.message);
            router.refresh();
          });
        }}
      >
        <RefreshCw size={16} aria-hidden="true" />
        {pending ? "색인 중…" : "모든 문서 다시 색인"}
      </button>
      <span className="lint-toolbar__hint">
        본문의 위키링크를 지금 제목·별칭 기준으로 다시 맞춥니다. 본문은 바뀌지 않습니다.
      </span>
      {message ? (
        <p className="form-message form-message--error" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
