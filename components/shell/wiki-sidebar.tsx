import { Trash2 } from "lucide-react";
import Link from "next/link";

import type { DocumentListItem } from "@/features/documents/types";

export function WikiSidebar({ documents }: { documents: DocumentListItem[] }) {
  return (
    <aside className="wiki-sidebar" aria-label="문서 탐색">
      <h2 className="sidebar-heading">최근 문서</h2>
      {documents.length === 0 ? (
        <p className="sidebar-empty">열어본 문서가 없습니다.</p>
      ) : (
        <ul className="sidebar-documents">
          {documents.map((document) => (
            <li key={document.id}>
              <Link href={`/documents/${document.slug}`}>{document.title}</Link>
            </li>
          ))}
        </ul>
      )}
      <Link className="sidebar-utility-link" href="/trash">
        <Trash2 size={15} aria-hidden="true" />
        휴지통
      </Link>
    </aside>
  );
}
