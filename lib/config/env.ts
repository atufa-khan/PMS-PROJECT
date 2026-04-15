import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),
  APP_URL: z.string().url().default("http://localhost:3000")
});

export const env = envSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  APP_URL: process.env.APP_URL
});

export function getSupabasePublicKey() {
  return (
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
  );
}

export function maskSecret(value: string | undefined | null, visibleTail = 6) {
  if (!value) {
    return "(missing)";
  }

  if (value.length <= visibleTail) {
    return "*".repeat(value.length);
  }

  return `${"*".repeat(Math.max(8, value.length - visibleTail))}${value.slice(-visibleTail)}`;
}

export function getSupabaseEnvSummary() {
  const publicKey = getSupabasePublicKey();

  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL ?? "(missing)",
    publicKeyPresent: Boolean(publicKey),
    publicKeyPreview: maskSecret(publicKey),
    databaseUrlPresent: Boolean(env.DATABASE_URL),
    directUrlPresent: Boolean(env.DIRECT_URL),
    appUrl: env.APP_URL
  };
}
