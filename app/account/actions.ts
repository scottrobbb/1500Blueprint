"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { appBaseUrl } from "@/lib/auth/config";
import { findAuthUserByEmail, recordPasswordLogin } from "@/lib/auth/accounts";
import { sendAccountVerification, sendPasswordReset } from "@/lib/auth/email";
import {
  isPasswordAuthEnabled,
  isPasswordSignupEnabled,
  isValidEmail,
  normalizeEmail,
  safeNextPath,
  validatePassword,
} from "@/lib/auth/password";
import { getLegacySession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export type AuthActionState = {
  status: "idle" | "error" | "success";
  message: string;
  field?: "name" | "email" | "password" | "confirmPassword";
};

export async function loginWithPassword(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isPasswordAuthEnabled()) return unavailableState();

  const email = normalizeEmail(formData.get("email"));
  const password = stringValue(formData.get("password"));
  const next = safeNextPath(formData.get("next"));

  if (!isValidEmail(email)) return fieldError("email", "Enter a valid email address.");
  if (!password) return fieldError("password", "Enter your password.");

  const supabase = createClient(await cookies());
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return fieldError("password", "The email or password is incorrect.");
  }

  try {
    const account = await recordPasswordLogin(data.user);
    if (account.status !== "active") {
      await supabase.auth.signOut({ scope: "local" });
      return { status: "error", message: "This student account is not active." };
    }
  } catch (error) {
    console.error("password login account link failed:", error);
    await supabase.auth.signOut({ scope: "local" });
    return {
      status: "error",
      message: "We could not finish signing you in. Please try again shortly.",
    };
  }

  redirect(next);
}

export async function signUpWithPassword(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isPasswordSignupEnabled()) {
    return {
      status: "error",
      message: "New account registration is not open yet.",
    };
  }

  return createPasswordAccount(formData, null);
}

export async function claimPasswordAccount(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isPasswordAuthEnabled()) return unavailableState();

  const legacySession = await getLegacySession();
  if (!legacySession) {
    return { status: "error", message: "Sign in with your current login link first." };
  }

  return createPasswordAccount(formData, legacySession.email);
}

export async function requestPasswordReset(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isPasswordAuthEnabled()) return unavailableState();

  const email = normalizeEmail(formData.get("email"));
  if (!isValidEmail(email)) return fieldError("email", "Enter a valid email address.");

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${accountBaseUrl()}/account/reset-password` },
  });

  if (error || !data.properties.hashed_token) {
    if (error) console.error("password reset link generation failed:", error.message);
  } else {
    try {
      await sendPasswordReset(
        email,
        accountConfirmationUrl(data.properties.hashed_token, "recovery", "/account/reset-password"),
      );
    } catch (sendError) {
      console.error("password reset email failed:", sendError);
    }
  }

  return {
    status: "success",
    message: "If an account exists for that email, a reset link is on its way.",
  };
}

export async function updatePassword(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isPasswordAuthEnabled()) return unavailableState();

  const password = stringValue(formData.get("password"));
  const confirmPassword = stringValue(formData.get("confirmPassword"));
  const passwordResult = validatePassword(password);
  if (!passwordResult.valid) return fieldError("password", passwordResult.message);
  if (password !== confirmPassword) {
    return fieldError("confirmPassword", "The passwords do not match.");
  }

  const supabase = createClient(await cookies());
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return {
      status: "error",
      message: "That reset session expired. Request a new password reset link.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return fieldError("password", friendlyPasswordError(error.message));

  try {
    await recordPasswordLogin(userData.user);
  } catch (accountError) {
    console.error("password reset account link failed:", accountError);
    return {
      status: "error",
      message: "Your password changed, but we could not load your student account.",
    };
  }

  redirect("/drills");
}

async function createPasswordAccount(
  formData: FormData,
  lockedEmail: string | null,
): Promise<AuthActionState> {
  const name = stringValue(formData.get("name")).trim();
  const email = lockedEmail?.trim().toLowerCase() ?? normalizeEmail(formData.get("email"));
  const password = stringValue(formData.get("password"));
  const confirmPassword = stringValue(formData.get("confirmPassword"));

  if (!lockedEmail && name.length < 2) {
    return fieldError("name", "Enter the student's name.");
  }
  if (!isValidEmail(email)) return fieldError("email", "Enter a valid email address.");

  const passwordResult = validatePassword(password);
  if (!passwordResult.valid) return fieldError("password", passwordResult.message);
  if (password !== confirmPassword) {
    return fieldError("confirmPassword", "The passwords do not match.");
  }

  const admin = supabaseAdmin();
  if (lockedEmail) {
    let claimedExistingUser = false;
    try {
      const existingAuthUser = await findAuthUserByEmail(email);
      if (existingAuthUser) {
        const { error: updateError } = await admin.auth.admin.updateUserById(existingAuthUser.id, {
          password,
          email_confirm: true,
        });
        if (updateError) throw updateError;

        const supabase = createClient(await cookies());
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError || !signInData.user) {
          throw signInError ?? new Error("updated auth user could not sign in");
        }

        await recordPasswordLogin(signInData.user);
        claimedExistingUser = true;
      }
    } catch (existingUserError) {
      console.error("existing password account claim failed:", existingUserError);
      return {
        status: "error",
        message: "We could not link that existing login. Please try again.",
      };
    }
    if (claimedExistingUser) redirect("/drills");
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: {
      data: name ? { display_name: name } : undefined,
      redirectTo: `${accountBaseUrl()}/drills`,
    },
  });

  if (error || !data.properties.hashed_token) {
    console.error("password verification link generation failed:", {
      code: error?.code,
      status: error?.status,
      message: error?.message ?? "missing verification token",
    });
    return fieldError(
      "password",
      friendlyPasswordError(error?.message ?? "Unable to generate verification link"),
    );
  }

  try {
    await sendAccountVerification(
      email,
      accountConfirmationUrl(data.properties.hashed_token, "signup", "/drills"),
    );
  } catch (sendError) {
    console.error("password verification email failed:", sendError);
    const { error: cleanupError } = await admin.auth.admin.deleteUser(data.user.id);
    if (cleanupError) console.error("unconfirmed auth user cleanup failed:", cleanupError.message);
    return {
      status: "error",
      message: "We could not send the verification email. Please try again.",
    };
  }

  return {
    status: "success",
    message: "Check your email to verify the address and finish setting up your password.",
  };
}

function accountBaseUrl(): string {
  return appBaseUrl(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
}

function accountConfirmationUrl(
  tokenHash: string,
  type: "signup" | "recovery",
  next: string,
): string {
  const url = new URL("/account/confirm", accountBaseUrl());
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("next", next);
  return url.toString();
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function fieldError(field: AuthActionState["field"], message: string): AuthActionState {
  return { status: "error", message, field };
}

function unavailableState(): AuthActionState {
  return {
    status: "error",
    message: "Password sign-in is not enabled yet. Use the current member login.",
  };
}

function friendlyPasswordError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("password") && normalized.includes("weak")) {
    return "Choose a stronger password with a mix of letters and numbers.";
  }
  if (normalized.includes("rate") || normalized.includes("security")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  return "We could not create that login. Try again or reset the password.";
}
