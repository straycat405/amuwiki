import { ListChecks } from "lucide-react";

import { SuggestionList } from "@/components/lint/suggestion-list";
import { listPendingSuggestions, refreshSuggestions } from "@/features/lint/data";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "정리" };

export default async function LintPage() {
  const user = await requireOwner();
  const supabase = await createClient();
  await refreshSuggestions(supabase);
  const suggestions = await listPendingSuggestions(supabase, user.id);

  return (
    <main className="document-stage document-stage--reading" id="main-content">
      <section className="settings-view" aria-labelledby="lint-title">
        <header className="settings-view__header">
          <ListChecks size={22} aria-hidden="true" />
          <h1 id="lint-title">정리</h1>
        </header>
        <p className="import-intro">
          제안은 문서를 자동으로 바꾸지 않습니다. 적용을 누른 항목만 반영되고, 무시한
          항목은 상태가 바뀔 때까지 다시 나타나지 않습니다.
        </p>
        <SuggestionList suggestions={suggestions} />
      </section>
    </main>
  );
}
