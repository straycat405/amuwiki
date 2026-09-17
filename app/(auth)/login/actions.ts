"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { isOwnerEmail } from "@/features/auth/owner";
import { getServerEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.email("이메일 형식을 확인하세요.").max(254),
  password: z.string().min(1, "비밀번호를 입력하세요.").max(200),
});

export type LoginState = {
  status: "idle" | "error";
  message?: string;
};

/** Owner mismatch and wrong password return the same message so a failed attempt can't be used to
 * probe which email is the registered owner. */
const GENERIC_ERROR = "이메일 또는 비밀번호가 올바르지 않습니다.";

export async function loginWithPassword(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message };
  }

  const env = getServerEnv();
  if (!isOwnerEmail(parsed.data.email, env.OWNER_EMAIL)) {
    return { status: "error", message: GENERIC_ERROR };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !isOwnerEmail(data.user?.email, env.OWNER_EMAIL)) {
    if (!error) await supabase.auth.signOut();
    return { status: "error", message: GENERIC_ERROR };
  }

  redirect("/");
}
