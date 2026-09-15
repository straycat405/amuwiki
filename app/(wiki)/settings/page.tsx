import { FileUp, ListChecks, Settings } from "lucide-react";
import Link from "next/link";

import { AiSettingsSection } from "@/components/settings/ai-settings";
import { SettingsForm } from "@/components/settings/settings-form";
import { getAiSettings, getMonthlyUsage } from "@/features/ai/data";
import { refreshSuggestions } from "@/features/lint/data";
import { requireOwner } from "@/lib/auth/require-owner";
import { getAiServerEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "설정" };

export default async function SettingsPage() {
  const user = await requireOwner();
  const supabase = await createClient();
  const aiEnv = getAiServerEnv();
  const [pendingCount, aiSettings, aiUsage] = await Promise.all([
    refreshSuggestions(supabase),
    getAiSettings(supabase, user.id),
    getMonthlyUsage(supabase),
  ]);

  return (
    <main className="document-stage document-stage--reading" id="main-content">
      <section className="settings-view" aria-labelledby="settings-title">
        <header className="settings-view__header">
          <Settings size={22} aria-hidden="true" />
          <h1 id="settings-title">설정</h1>
        </header>
        <SettingsForm />
        <AiSettingsSection
          configured={aiEnv.encryptionSecret !== null}
          model={aiEnv.model}
          settings={aiSettings}
          usage={aiUsage}
        />
        <div className="settings-section">
          <header className="settings-section__header">
            <h2>정리</h2>
            <p>
              {pendingCount > 0
                ? `연결할 수 있는 링크, 빈 요약 등 ${pendingCount}건의 제안이 있습니다.`
                : "정리할 항목이 없습니다."}
            </p>
          </header>
          <Link className="secondary-button" href="/settings/lint">
            <ListChecks size={16} aria-hidden="true" />
            정리 열기
          </Link>
        </div>
        <div className="settings-section">
          <header className="settings-section__header">
            <h2>Markdown 가져오기</h2>
            <p>여러 개의 .md, .markdown, .txt 파일을 문서로 가져옵니다.</p>
          </header>
          <Link className="secondary-button" href="/settings/import">
            <FileUp size={16} aria-hidden="true" />
            가져오기 열기
          </Link>
        </div>
      </section>
    </main>
  );
}
