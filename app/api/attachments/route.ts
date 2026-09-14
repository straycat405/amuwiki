import { createHash } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { findAttachmentByStoragePath, insertAttachment } from "@/features/attachments/data";
import { MAX_ATTACHMENT_BYTES, imageMimeTypes } from "@/features/attachments/types";
import { requireApiUser } from "@/lib/auth/api-auth";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export const ATTACHMENTS_BUCKET = "attachments";

export async function POST(request: NextRequest) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const documentId = formData.get("documentId");

  if (!(file instanceof File) || typeof documentId !== "string" || !documentId) {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!imageMimeTypes.includes(file.type as (typeof imageMimeTypes)[number])) {
    return NextResponse.json(
      { message: "이미지 파일(PNG, JPEG, GIF, WEBP)만 올릴 수 있습니다." },
      { status: 400 },
    );
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { message: "파일 크기는 25MB를 넘을 수 없습니다." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const extension = EXTENSION_BY_MIME[file.type] ?? "bin";
  const storagePath = `${user.id}/${documentId}/${sha256}.${extension}`;

  const existing = await findAttachmentByStoragePath(supabase, user.id, storagePath);
  if (existing) {
    return NextResponse.json({ id: existing.id, url: `/api/attachments/${existing.id}` });
  }

  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: true });
  if (uploadError) {
    return NextResponse.json(
      { message: "이미지를 저장하지 못했습니다." },
      { status: 500 },
    );
  }

  const attachment = await insertAttachment(supabase, user.id, {
    documentId,
    storagePath,
    originalName: file.name.slice(0, 200) || "image",
    mimeType: file.type,
    sizeBytes: file.size,
    sha256,
  });
  if (!attachment) {
    return NextResponse.json(
      { message: "이미지를 문서에 연결하지 못했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    id: attachment.id,
    url: `/api/attachments/${attachment.id}`,
  });
}
