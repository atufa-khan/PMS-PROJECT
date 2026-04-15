import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env, getSupabasePublicKey } from "@/lib/config/env";

type CookieMutation = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabasePublicKey();

  if (!url || !key) {
    return null;
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieMutation[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as never);
          });
        } catch {
          // Server Components cannot always mutate cookies.
        }
      }
    }
  });
}
