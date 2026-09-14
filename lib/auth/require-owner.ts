import { redirect } from "next/navigation";

import { isOwnerEmail } from "@/features/auth/owner";
import { getServerEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isOwnerEmail(user.email, getServerEnv().OWNER_EMAIL)) {
    redirect("/login");
  }

  return user;
}
