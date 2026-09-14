import { FileUp, Settings } from "lucide-react";
import Link from "next/link";

import { SettingsForm } from "@/components/settings/settings-form";

export const metadata = { title: "설정" };

export default function SettingsPage() {
  return (
    <main className="document-stage document-stage--reading" id="main-content">
      <section className="settings-view" aria-labelledby="settings-title">
        <header className="settings-view__header">
          <Settings size={22} aria-hidden="true" />
          <h1 id="settings-title">설정</h1>
        </header>
        <SettingsForm />
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
