import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { archiveDocumentAction } from "@/app/(wiki)/documents/actions";
import { DocumentLifecycleButton } from "@/components/document/document-lifecycle-button";
import { WikiLinkExplorer } from "@/components/document/wiki-link-explorer";
import { getAiSettings } from "@/features/ai/data";
import {
  getDocumentBySlug,
  listBacklinks,
  resolveWikiLinkTargets,
} from "@/features/documents/data";
import { recordDocumentView } from "@/features/history/data";
import { requireOwner } from "@/lib/auth/require-owner";
import { decodeDocumentSlug } from "@/lib/markdown/slug";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: PageProps<"/documents/[slug]">): Promise<Metadata> {
  const { slug: encodedSlug } = await params;
  const slug = decodeDocumentSlug(encodedSlug);
  if (!slug) return {};

  const user = await requireOwner();
  const supabase = await createClient();
  const document = await getDocumentBySlug(supabase, user.id, slug);
  if (!document) return {};

  return { title: document.title };
}

export default async function DocumentPage({
  params,
}: PageProps<"/documents/[slug]">) {
  const { slug: encodedSlug } = await params;
  const slug = decodeDocumentSlug(encodedSlug);
  if (!slug) notFound();
  const user = await requireOwner();
  const supabase = await createClient();
  const document = await getDocumentBySlug(supabase, user.id, slug);
  if (!document) notFound();
  void recordDocumentView(supabase, document.id);
  const [wikiLinkResolutions, backlinks, aiSettings] = await Promise.all([
    resolveWikiLinkTargets(supabase, user.id, document.body_markdown),
    listBacklinks(supabase, user.id, document.id),
    getAiSettings(supabase, user.id),
  ]);

  return (
    <main className="document-stage document-stage--reading" id="main-content">
      <article className="document-view">
        <header className="document-view__header">
          <div>
            <h1>{document.title}</h1>
            {document.summary ? <p>{document.summary}</p> : null}
          </div>
          <div className="document-view__actions">
            <Link
              className="secondary-button"
              href={`/documents/${document.slug}/edit`}
            >
              <Pencil size={16} aria-hidden="true" />
              편집
            </Link>
            <DocumentLifecycleButton
              action={archiveDocumentAction.bind(
                null,
                document.id,
                document.version,
              )}
              kind="archive"
            />
          </div>
        </header>
        <WikiLinkExplorer aiEnabled={aiSettings.enabled} markdown={document.body_markdown} pageSlug={document.slug} wikiLinkResolutions={wikiLinkResolutions} />
        {backlinks.length > 0 ? (
          <section className="backlinks" aria-labelledby="backlinks-title">
            <h2 id="backlinks-title">연결된 문서</h2>
            <ul>
              {backlinks.map((backlink) => (
                <li key={backlink.slug}>
                  <Link href={`/documents/${backlink.slug}`}>{backlink.title}</Link>
                  {backlink.summary ? <p>{backlink.summary}</p> : null}
                  <span>{backlink.occurrenceCount}회 언급</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </main>
  );
}
