import { isOwnerEmail } from "@/features/auth/owner";
import { getServerEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** Authenticates the caller for a Route Handler without redirecting (unlike `requireOwner`, which is for pages). */
export async function requireApiUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwnerEmail(user.email, getServerEnv().OWNER_EMAIL)) {
    return { supabase, user: null } as const;
  }
  return { supabase, user } as const;
}
