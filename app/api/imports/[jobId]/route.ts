import { NextResponse, type NextRequest } from "next/server";

import { getImportJob, listImportItems } from "@/features/imports/data";
import type { ImportItemStatus } from "@/features/imports/types";
import { requireApiUser } from "@/lib/auth/api-auth";

export type ImportJobStatusResponse = {
  jobId: string;
  jobStatus: string;
  counts: Record<ImportItemStatus, number>;
  total: number;
  items: {
    id: string;
    relativePath: string;
    detectedTitle: string;
    status: ImportItemStatus;
    warningCodes: string[];
  }[];
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const job = await getImportJob(supabase, user.id, jobId);
  if (!job) {
    return NextResponse.json({ message: "가져오기 작업을 찾을 수 없습니다." }, { status: 404 });
  }

  const items = await listImportItems(supabase, jobId);
  const counts: Record<ImportItemStatus, number> = {
    pending: 0,
    ready: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
  };
  for (const item of items) counts[item.status] += 1;

  const response: ImportJobStatusResponse = {
    jobId: job.id,
    jobStatus: job.status,
    counts,
    total: items.length,
    items,
  };
  return NextResponse.json(response);
}
