import { NextResponse } from "next/server";

import { buildExportZip } from "@/features/export/build";
import { requireApiUser } from "@/lib/auth/api-auth";

export async function GET() {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  let zip: Buffer;
  try {
    zip = await buildExportZip(supabase, user.id);
  } catch {
    return NextResponse.json({ message: "내보내기를 만들지 못했습니다." }, { status: 500 });
  }

  const filename = `아무위키-내보내기-${new Date().toISOString().slice(0, 10)}.zip`;
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
