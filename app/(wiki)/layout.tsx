import type { ReactNode } from "react";

import { AppHeader } from "@/components/shell/app-header";
import { SiteFooter } from "@/components/shell/site-footer";
import { WikiSidebar } from "@/components/shell/wiki-sidebar";
import { PreferencesProvider } from "@/components/preferences/preferences-provider";
import { listDocuments } from "@/features/documents/data";
import { getPreferences } from "@/features/preferences/data";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WikiLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireOwner();
  const supabase = await createClient();
  const [documents, preferences] = await Promise.all([
    listDocuments(supabase, user.id, 20),
    getPreferences(supabase, user.id),
  ]);

  return (
    <PreferencesProvider initial={preferences}>
      <div className="app-shell">
        <AppHeader />
        <WikiSidebar documents={documents} />
        {children}
        <SiteFooter />
      </div>
    </PreferencesProvider>
  );
}
