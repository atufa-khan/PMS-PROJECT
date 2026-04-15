import { createBrowserClient } from "@supabase/ssr";
import { env, getSupabasePublicKey } from "@/lib/config/env";

export function createSupabaseBrowserClient() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabasePublicKey();

  if (!url || !key) {
    throw new Error("Supabase public environment variables are not configured.");
  }

  return createBrowserClient(url, key);
}
