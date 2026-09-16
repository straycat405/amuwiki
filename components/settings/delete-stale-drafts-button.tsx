"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteStaleDraftsAction } from "@/app/(wiki)/settings/drafts/actions";

type DeleteStaleDraftsButtonProps = {
  documentIds: string[];
};

export function DeleteStaleDraftsButton({ documentIds }: DeleteStaleDraftsButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="lint-toolbar">
      <button
        type="button"
        className="secondary-button secondary-button--danger"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              `임시 문서 ${documentIds.length}건과 첨부파일을 완전히 삭제할까요? 되돌릴 수 없습니다.`,
            )
          ) {
            return;
          }
          setMessage(null);
          startTransition(async () => {
            const result = await deleteStaleDraftsAction(documentIds);
            if (!result.ok) {
              setMessage(result.message);
            } else if (result.failedCount > 0) {
              setMessage(
                `${result.deletedDocuments}건 정리했지만 ${result.failedCount}건은 실패했습니다. 다시 시도해주세요.`,
              );
            }
            router.refresh();
          });
        }}
      >
        <Trash2 size={16} aria-hidden="true" />
        {pending ? "정리 중…" : `지금 정리하기 (${documentIds.length}건)`}
      </button>
      {message ? (
        <p className="form-message form-message--error" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
