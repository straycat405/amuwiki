import { Settings } from "lucide-react";

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
      </section>
    </main>
  );
}
