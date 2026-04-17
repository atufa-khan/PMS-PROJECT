import { z } from "zod";

const optionalBoolean = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return value;
}, z.boolean().optional());

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  INTERNAL_JOB_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: optionalBoolean,
  SMTP_REQUIRE_TLS: optionalBoolean,
  SMTP_TLS_REJECT_UNAUTHORIZED: optionalBoolean,
  SMTP_FROM_EMAIL: z.string().optional(),
  SMTP_FROM_NAME: z.string().optional(),
  ALLOW_ELEVATED_SELF_SIGNUP: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true")
});

export const env = envSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  APP_URL: process.env.APP_URL,
  INTERNAL_JOB_SECRET: process.env.INTERNAL_JOB_SECRET,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_SECURE: process.env.SMTP_SECURE,
  SMTP_REQUIRE_TLS: process.env.SMTP_REQUIRE_TLS,
  SMTP_TLS_REJECT_UNAUTHORIZED: process.env.SMTP_TLS_REJECT_UNAUTHORIZED,
  SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL,
  SMTP_FROM_NAME: process.env.SMTP_FROM_NAME,
  ALLOW_ELEVATED_SELF_SIGNUP: process.env.ALLOW_ELEVATED_SELF_SIGNUP
});

export function getSupabasePublicKey() {
  return (
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
  );
}

export function getSupabaseAdminKey() {
  return env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

export function getSmtpSummary() {
  const host = env.SMTP_HOST ?? "";
  const port = env.SMTP_PORT ?? null;
  const authConfigured = Boolean(env.SMTP_USER && env.SMTP_PASS);
  const authPartiallyConfigured =
    Boolean(env.SMTP_USER || env.SMTP_PASS) && !authConfigured;

  return {
    configured: Boolean(host && port && !authPartiallyConfigured),
    host,
    port,
    userConfigured: Boolean(env.SMTP_USER),
    passwordConfigured: Boolean(env.SMTP_PASS),
    authConfigured,
    authPartiallyConfigured,
    secure: env.SMTP_SECURE ?? port === 465,
    requireTls: env.SMTP_REQUIRE_TLS ?? port === 587,
    tlsRejectUnauthorized: env.SMTP_TLS_REJECT_UNAUTHORIZED ?? true,
    fromEmail: env.SMTP_FROM_EMAIL ?? "no-reply@pms.local",
    fromName: env.SMTP_FROM_NAME ?? "PMS"
  };
}

export function getInternalJobSummary() {
  return {
    configured: Boolean(env.INTERNAL_JOB_SECRET),
    endpoint: `${env.APP_URL}/api/internal/notifications/process`
  };
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
    adminKeyPresent: Boolean(getSupabaseAdminKey()),
    databaseUrlPresent: Boolean(env.DATABASE_URL),
    directUrlPresent: Boolean(env.DIRECT_URL),
    appUrl: env.APP_URL,
    internalJobSecretPresent: Boolean(env.INTERNAL_JOB_SECRET),
    smtpConfigured: getSmtpSummary().configured,
    allowElevatedSelfSignup: env.ALLOW_ELEVATED_SELF_SIGNUP
  };
}
