import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarkdownRenderer } from "@/components/document/markdown-renderer";
import { getDocumentBySlug } from "@/features/documents/data";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentPage({
  params,
}: PageProps<"/documents/[slug]">) {
  const { slug } = await params;
  const user = await requireOwner();
  const supabase = await createClient();
  const document = await getDocumentBySlug(supabase, user.id, slug);
  if (!document) notFound();

  return (
    <main className="document-stage document-stage--reading" id="main-content">
      <article className="document-view">
        <header className="document-view__header">
          <div>
            <h1>{document.title}</h1>
            {document.summary ? <p>{document.summary}</p> : null}
          </div>
          <Link
            className="secondary-button"
            href={`/documents/${document.slug}/edit`}
          >
            <Pencil size={16} aria-hidden="true" />
            편집
          </Link>
        </header>
        <MarkdownRenderer markdown={document.body_markdown} />
      </article>
    </main>
  );
}
