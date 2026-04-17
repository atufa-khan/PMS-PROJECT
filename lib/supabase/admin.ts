import "server-only";

import { createClient } from "@supabase/supabase-js";
import { env, getSupabaseAdminKey } from "@/lib/config/env";

export function createSupabaseAdminClient() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseAdminKey();

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
