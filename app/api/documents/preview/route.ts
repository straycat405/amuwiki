import { NextResponse, type NextRequest } from "next/server";

import {
  getDocumentBySlug,
  resolveWikiLinkTargets,
} from "@/features/documents/data";
import { requireApiUser } from "@/lib/auth/api-auth";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug")?.trim();
  if (!slug || slug.length > 240) {
    return NextResponse.json({ message: "잘못된 문서입니다." }, { status: 400 });
  }

  const { supabase, user } = await requireApiUser();
  if (!user) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const document = await getDocumentBySlug(supabase, user.id, slug);
  if (!document) {
    return NextResponse.json({ message: "문서를 찾을 수 없습니다." }, { status: 404 });
  }

  const wikiLinkResolutions = await resolveWikiLinkTargets(
    supabase,
    user.id,
    document.body_markdown,
  );
  return NextResponse.json(
    {
      slug: document.slug,
      title: document.title,
      summary: document.summary,
      bodyMarkdown: document.body_markdown,
      wikiLinkResolutions,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
