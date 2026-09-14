import { NextResponse } from "next/server";

import { getAttachmentById } from "@/features/attachments/data";
import { requireApiUser } from "@/lib/auth/api-auth";

const ATTACHMENTS_BUCKET = "attachments";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const attachment = await getAttachmentById(supabase, user.id, id);
  if (!attachment) {
    return NextResponse.json({ message: "이미지를 찾을 수 없습니다." }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .download(attachment.storagePath);
  if (error || !data) {
    return NextResponse.json({ message: "이미지를 불러오지 못했습니다." }, { status: 404 });
  }

  return new NextResponse(data, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
