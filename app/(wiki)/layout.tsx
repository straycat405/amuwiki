import type { ReactNode } from "react";

import { AppHeader } from "@/components/shell/app-header";
import { SiteFooter } from "@/components/shell/site-footer";
import { WikiSidebar } from "@/components/shell/wiki-sidebar";
import { listDocuments } from "@/features/documents/data";
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
  const documents = await listDocuments(supabase, user.id, 20);

  return (
    <div className="app-shell">
      <AppHeader />
      <WikiSidebar documents={documents} />
      {children}
      <SiteFooter />
    </div>
  );
}
