"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { APP_ROLES } from "@/lib/auth/roles";
import { withDbTransaction } from "@/lib/db/server";
import { syncProfileForAuthUser } from "@/lib/auth/profile-sync";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const signUpSchema = z
  .object({
    fullName: z.string().min(2),
    email: z.string().email(),
    role: z.enum(APP_ROLES),
    managerProfileId: z.string().uuid().optional(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8)
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  });

export type SignUpActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function signUpAction(
  _prevState: SignUpActionState,
  formData: FormData
): Promise<SignUpActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    role: formData.get("role"),
    managerProfileId: formData.get("managerProfileId") || undefined,
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword")
  });

  if (!parsed.success) {
    return {
      status: "error",
      message:
        parsed.error.issues[0]?.message ??
        "Please check the sign-up details."
    };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      status: "error",
      message: "Supabase auth is not configured yet."
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${env.APP_URL}/login`,
      data: {
        full_name: parsed.data.fullName,
        role: parsed.data.role,
        manager_profile_id:
          parsed.data.role === "employee" ? parsed.data.managerProfileId ?? null : null
      }
    }
  });

  if (error) {
    return {
      status: "error",
      message: error.message
    };
  }

  if (data.user && data.session) {
    const authUser = data.user;
    await withDbTransaction((client) => syncProfileForAuthUser(client, authUser));
    redirect("/dashboard");
  }

  return {
    status: "success",
    message:
      "Account created. If email confirmation is enabled in Supabase, check your inbox before signing in."
  };
}
