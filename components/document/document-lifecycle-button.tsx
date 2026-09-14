"use client";

import { Archive, RotateCcw } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import type { DocumentActionState } from "@/features/documents/action-state";
import { initialDocumentActionState } from "@/features/documents/action-state";

type DocumentLifecycleButtonProps = {
  action: (state: DocumentActionState) => Promise<DocumentActionState>;
  kind: "archive" | "restore";
};

export function DocumentLifecycleButton({
  action,
  kind,
}: DocumentLifecycleButtonProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    action,
    initialDocumentActionState,
  );
  const isArchive = kind === "archive";

  useEffect(() => {
    if (state.status === "success" && state.redirectTo) {
      router.push(state.redirectTo as Route);
    }
  }, [router, state]);

  return (
    <form
      action={formAction}
      className="lifecycle-action"
      onSubmit={(event) => {
        if (isArchive && !window.confirm("이 문서를 휴지통으로 이동할까요?")) {
          event.preventDefault();
        }
      }}
    >
      <button
        className={`secondary-button${isArchive ? " secondary-button--danger" : ""}`}
        disabled={pending}
        type="submit"
      >
        {isArchive ? (
          <Archive size={16} aria-hidden="true" />
        ) : (
          <RotateCcw size={16} aria-hidden="true" />
        )}
        {pending ? "처리 중" : isArchive ? "휴지통" : "복원"}
      </button>
      {state.status === "error" ? (
        <span className="lifecycle-action__error" role="status">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
