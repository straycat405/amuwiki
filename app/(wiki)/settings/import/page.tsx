import { FileUp } from "lucide-react";

import { ImportWizard } from "@/components/import/import-wizard";

export const metadata = { title: "가져오기" };

export default function ImportPage() {
  return (
    <main className="document-stage document-stage--reading" id="main-content">
      <section className="settings-view" aria-labelledby="import-title">
        <header className="settings-view__header">
          <FileUp size={22} aria-hidden="true" />
          <h1 id="import-title">Markdown 가져오기</h1>
        </header>
        <p className="import-intro">
          .md, .markdown, .txt 파일을 여러 개 선택해 문서로 가져올 수 있습니다. 먼저
          내용을 분석해 표본과 충돌 여부를 보여준 뒤, 확인 후 실제로 가져옵니다. ZIP
          압축 파일이나 Obsidian vault 가져오기는 아직 지원하지 않습니다.
        </p>
        <ImportWizard />
      </section>
    </main>
  );
}
