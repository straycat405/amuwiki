import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import {
  addDocumentAlias,
  createDocument,
} from "@/features/documents/data";
import {
  IMPORTS_BUCKET,
  getImportJob,
  listImportItems,
  storageKeyFor,
  updateImportItem,
  updateImportJobStatus,
} from "@/features/imports/data";
import { parseImportFile } from "@/features/imports/parse";
import {
  frontmatterAliases,
  frontmatterUnknownFields,
} from "@/lib/markdown/frontmatter";
import type { ImportCommitResult, ImportResultItem } from "@/features/imports/types";
import { requireApiUser } from "@/lib/auth/api-auth";
import { slugifyDocumentTitle } from "@/lib/markdown/slug";

const MAX_RENAME_ATTEMPTS = 20;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    conflictPolicy?: string;
  } | null;
  const conflictPolicy = body?.conflictPolicy === "rename" ? "rename" : "skip";

  const job = await getImportJob(supabase, user.id, jobId);
  if (!job) {
    return NextResponse.json({ message: "가져오기 작업을 찾을 수 없습니다." }, { status: 404 });
  }

  await updateImportJobStatus(supabase, jobId, "importing");

  const items = await listImportItems(supabase, jobId);
  const resultItems: ImportResultItem[] = [];
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    if (item.status === "failed") {
      failed += 1;
      resultItems.push({
        relativePath: item.relativePath,
        title: item.detectedTitle,
        status: "failed",
      });
      continue;
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from(IMPORTS_BUCKET)
      .download(`${job.storagePath}/${storageKeyFor(item.relativePath)}`);
    if (downloadError || !fileData) {
      failed += 1;
      await updateImportItem(supabase, item.id, { status: "failed" });
      resultItems.push({
        relativePath: item.relativePath,
        title: item.detectedTitle,
        status: "failed",
      });
      continue;
    }

    const raw = await fileData.text();
    const { title, content, data } = parseImportFile(item.relativePath, raw);
    const aliases = frontmatterAliases(data);
    const frontmatter = frontmatterUnknownFields(data);

    let attemptTitle = title;
    let outcome: Awaited<ReturnType<typeof createDocument>> | null = null;
    let attempts = 0;
    do {
      outcome = await createDocument(supabase, {
        title: attemptTitle,
        summary: "",
        bodyMarkdown: content,
      }, frontmatter);
      attempts += 1;
      if (outcome.ok || outcome.reason !== "duplicate" || conflictPolicy !== "rename") {
        break;
      }
      attemptTitle = `${title} (${attempts + 1})`;
    } while (attempts < MAX_RENAME_ATTEMPTS);

    if (outcome.ok && outcome.id) {
      imported += 1;
      for (const alias of aliases) {
        await addDocumentAlias(supabase, user.id, outcome.id, alias);
      }
      await updateImportItem(supabase, item.id, {
        status: "imported",
        targetDocumentId: outcome.id,
      });
      resultItems.push({
        relativePath: item.relativePath,
        title: attemptTitle,
        status: "imported",
        slug: slugifyDocumentTitle(attemptTitle),
      });
    } else if (!outcome.ok && outcome.reason === "duplicate") {
      skipped += 1;
      await updateImportItem(supabase, item.id, { status: "skipped" });
      resultItems.push({
        relativePath: item.relativePath,
        title,
        status: "skipped",
      });
    } else {
      failed += 1;
      await updateImportItem(supabase, item.id, { status: "failed" });
      resultItems.push({
        relativePath: item.relativePath,
        title,
        status: "failed",
      });
    }
  }

  const finalStatus = failed === 0 ? "completed" : imported > 0 ? "partial" : "failed";
  await updateImportJobStatus(supabase, jobId, finalStatus, {
    imported,
    skipped,
    failed,
  });

  if (imported > 0) revalidatePath("/");

  const result: ImportCommitResult = { imported, skipped, failed, items: resultItems };
  return NextResponse.json(result);
}
