import type { ReactNode } from "react";

import { AppHeader } from "@/components/shell/app-header";
import { SidebarProvider } from "@/components/shell/sidebar-provider";
import { SiteFooter } from "@/components/shell/site-footer";
import { WikiSidebar } from "@/components/shell/wiki-sidebar";
import { PreferencesProvider } from "@/components/preferences/preferences-provider";
import { listRecentViewsPage } from "@/features/history/data";
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
  const [recentViewsPage, preferences] = await Promise.all([
    listRecentViewsPage(supabase, user.id, 20),
    getPreferences(supabase, user.id),
  ]);

  return (
    <PreferencesProvider initial={preferences}>
      <SidebarProvider>
        <AppHeader />
        <WikiSidebar
          recentViews={recentViewsPage.views}
          initialHasMore={recentViewsPage.hasMore}
        />
        {children}
        <SiteFooter />
      </SidebarProvider>
    </PreferencesProvider>
  );
}
