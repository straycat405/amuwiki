import { Download, FileUp, HardDriveDownload, ListChecks, Settings } from "lucide-react";
import Link from "next/link";

import { AiSettingsSection } from "@/components/settings/ai-settings";
import { SettingsForm } from "@/components/settings/settings-form";
import { getAiSettings, getMonthlyUsage } from "@/features/ai/data";
import { listStaleDraftDocuments } from "@/features/documents/cleanup";
import { getExportStats } from "@/features/export/build";
import { refreshSuggestions } from "@/features/lint/data";
import { requireOwner } from "@/lib/auth/require-owner";
import { getAiServerEnv } from "@/lib/env";
import { formatBytes } from "@/lib/format-bytes";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "설정" };

export default async function SettingsPage() {
  const user = await requireOwner();
  const supabase = await createClient();
  const aiEnv = getAiServerEnv();
  const [pendingCount, aiSettings, aiUsage, staleDrafts, exportStats] = await Promise.all([
    refreshSuggestions(supabase),
    getAiSettings(supabase, user.id),
    getMonthlyUsage(supabase),
    listStaleDraftDocuments(supabase, user.id),
    getExportStats(supabase, user.id),
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
          models={aiEnv.models}
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
            <p>.md, .markdown, .txt 파일 또는 ZIP(Markdown 폴더·Obsidian vault)을 문서로 가져옵니다.</p>
          </header>
          <Link className="secondary-button" href="/settings/import">
            <FileUp size={16} aria-hidden="true" />
            가져오기 열기
          </Link>
        </div>
        <div className="settings-section">
          <header className="settings-section__header">
            <h2>임시 문서 정리</h2>
            <p>
              {staleDrafts.length > 0
                ? `저장하지 않고 떠난 임시 문서 ${staleDrafts.length}건이 있습니다.`
                : "정리할 임시 문서가 없습니다."}
            </p>
          </header>
          <Link className="secondary-button" href="/settings/drafts">
            <HardDriveDownload size={16} aria-hidden="true" />
            정리 열기
          </Link>
        </div>
        <div className="settings-section">
          <header className="settings-section__header">
            <h2>전체 내보내기</h2>
            <p>
              문서 {exportStats.documentCount}개 · 첨부 {exportStats.attachmentCount}개 · 약{" "}
              {formatBytes(exportStats.totalBytes)}
            </p>
          </header>
          <a className="secondary-button" href="/api/export">
            <Download size={16} aria-hidden="true" />
            ZIP으로 내보내기
          </a>
        </div>
      </section>
    </main>
  );
}
