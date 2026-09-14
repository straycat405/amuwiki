"use server";

import { z } from "zod";

import { isOwnerEmail } from "@/features/auth/owner";
import { getServerEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.email("이메일 형식을 확인하세요.").max(254),
});

export type LoginState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function requestLoginLink(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message };
  }

  const env = getServerEnv();
  const genericSuccess: LoginState = {
    status: "success",
    message: "로그인 링크를 확인하세요.",
  };

  if (!isOwnerEmail(parsed.data.email, env.OWNER_EMAIL)) {
    return genericSuccess;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      shouldCreateUser: false,
    },
  });

  if (error) {
    return { status: "error", message: "로그인 링크를 보낼 수 없습니다." };
  }

  return genericSuccess;
}
