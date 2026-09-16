import { HardDriveDownload } from "lucide-react";

import { DeleteStaleDraftsButton } from "@/components/settings/delete-stale-drafts-button";
import { STALE_DRAFT_GRACE_DAYS, listStaleDraftDocuments } from "@/features/documents/cleanup";
import { requireOwner } from "@/lib/auth/require-owner";
import { formatBytes } from "@/lib/format-bytes";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "임시 문서 정리" };

export default async function StaleDraftsPage() {
  const user = await requireOwner();
  const supabase = await createClient();
  const drafts = await listStaleDraftDocuments(supabase, user.id);

  return (
    <main className="document-stage document-stage--reading" id="main-content">
      <section className="settings-view" aria-labelledby="drafts-title">
        <header className="settings-view__header">
          <HardDriveDownload size={22} aria-hidden="true" />
          <h1 id="drafts-title">임시 문서 정리</h1>
        </header>
        <p className="import-intro">
          새 문서를 만들다가 저장하지 않고 떠나면, 첨부한 이미지를 위해 만들어진 숨겨진
          임시 문서가 남습니다. {STALE_DRAFT_GRACE_DAYS}일 넘게 손대지 않은 임시 문서만
          여기 나타나며, AI 질문 답변으로 저장한 초안 문서는 대상이 아닙니다.
        </p>
        {drafts.length === 0 ? (
          <p className="trash-empty">정리할 임시 문서가 없습니다.</p>
        ) : (
          <>
            <ul className="trash-list">
              {drafts.map((draft) => (
                <li key={draft.id}>
                  <div>
                    <strong>{draft.title}</strong>
                    <time dateTime={draft.updatedAt}>
                      마지막 수정{" "}
                      {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(
                        new Date(draft.updatedAt),
                      )}
                    </time>
                  </div>
                  <span>
                    첨부 {draft.attachmentCount}개 ({formatBytes(draft.totalBytes)})
                  </span>
                </li>
              ))}
            </ul>
            <DeleteStaleDraftsButton documentIds={drafts.map((draft) => draft.id)} />
          </>
        )}
      </section>
    </main>
  );
}
