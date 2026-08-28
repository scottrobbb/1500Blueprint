"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { appBaseUrl } from "@/lib/auth/config";
import { findAuthUserByEmail, recordPasswordLogin } from "@/lib/auth/accounts";
import { sendAccountVerification, sendPasswordReset } from "@/lib/auth/email";
import {
  PASSWORD_MAX_LENGTH,
  isPasswordAuthEnabled,
  isPasswordSignupEnabled,
  isValidEmail,
  normalizeEmail,
  passwordSignupAttemptLimit,
  safeNextPath,
  validatePassword,
} from "@/lib/auth/password";
import {
  friendlyPasswordError,
  runPasswordAccountCreation,
  runPasswordLogin,
  type AuthWorkflowState,
} from "@/lib/auth/password-workflows";
import { getLegacySession } from "@/lib/auth/session";
import { validateProfileName } from "@/lib/settings/profile-name";
import { reportServerError } from "@/lib/observability/server";
import { clientAddressFromHeaders } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export type AuthActionState = AuthWorkflowState;

export async function loginWithPassword(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isPasswordAuthEnabled()) return unavailableState();

  const email = normalizeEmail(formData.get("email"));
  const password = stringValue(formData.get("password"));
  const next = safeNextPath(formData.get("next"));

  if (!isValidEmail(email)) return fieldError("email", "Enter a valid email address.");
  if (!password || password.length > PASSWORD_MAX_LENGTH) {
    return fieldError("password", "The email or password is incorrect.");
  }
  if (!(await authActionAllowed("password-login", email, 10, 15 * 60))) {
    return fieldError("password", "Too many attempts. Wait a moment and try again.");
  }

  const supabase = createClient(await cookies());
  const result = await runPasswordLogin(
    { email, password, next },
    {
      signIn: async (credentials) => {
        const { data, error } = await supabase.auth.signInWithPassword(credentials);
        return { user: error ? null : data.user };
      },
      recordPasswordLogin,
      signOutLocal: async () => {
        await supabase.auth.signOut({ scope: "local" });
      },
      reportAccountLinkFailure: (error) => {
        reportServerError("auth.password_login.account_link_failed", error, {
          provider: "supabase",
          source: "loginWithPassword",
        });
      },
    },
  );
  if (result.kind === "redirect") redirect(result.path);
  return result.state;
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
  if (!(await authActionAllowed("password-reset", email, 3, 15 * 60))) {
    return {
      status: "success",
      message: "If an account exists for that email, a reset link is on its way.",
    };
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${accountBaseUrl()}/account/reset-password` },
  });

  if (error || !data.properties.hashed_token) {
    if (error) {
      reportServerError("auth.password_reset.link_generation_failed", error, {
        provider: "supabase",
        source: "requestPasswordReset",
      });
    }
  } else {
    try {
      await sendPasswordReset(
        email,
        accountConfirmationUrl(data.properties.hashed_token, "recovery", "/account/reset-password"),
      );
    } catch (sendError) {
      reportServerError("auth.password_reset.email_failed", sendError, {
        provider: "resend",
        source: "requestPasswordReset",
      });
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
    reportServerError("auth.password_reset.account_link_failed", accountError, {
      provider: "supabase",
      source: "updatePassword",
    });
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
  const next = safeNextPath(formData.get("next"));

  const nameValidation = validateProfileName(name);
  if (!lockedEmail && !nameValidation.valid) {
    return fieldError("name", nameValidation.message);
  }
  if (!isValidEmail(email)) return fieldError("email", "Enter a valid email address.");

  const passwordResult = validatePassword(password);
  if (!passwordResult.valid) return fieldError("password", passwordResult.message);
  if (password !== confirmPassword) {
    return fieldError("confirmPassword", "The passwords do not match.");
  }
  const attemptLimit = lockedEmail ? 5 : passwordSignupAttemptLimit();
  if (!(await authActionAllowed(lockedEmail ? "password-claim" : "password-signup", email, attemptLimit, 60 * 60))) {
    return {
      status: "error",
      message: "Too many attempts. Wait a while and try again.",
    };
  }

  const admin = supabaseAdmin();
  let claimClient: ReturnType<typeof createClient> | null = null;
  const result = await runPasswordAccountCreation(
    {
      email,
      password,
      displayName: nameValidation.valid ? nameValidation.name : null,
      next,
      redirectTo: `${accountBaseUrl()}${next}`,
      claimExisting: Boolean(lockedEmail),
    },
    {
      findExistingAuthUser: findAuthUserByEmail,
      updateExistingPassword: async (userId, nextPassword) => {
        const { error } = await admin.auth.admin.updateUserById(userId, {
          password: nextPassword,
          email_confirm: true,
        });
        if (error) throw error;
      },
      signIn: async (credentials) => {
        if (!lockedEmail) return { user: null, error: new Error("claim client is unavailable") };
        claimClient ??= createClient(await cookies());
        const { data, error } = await claimClient.auth.signInWithPassword(credentials);
        return { user: error ? null : data.user, error };
      },
      recordPasswordLogin,
      generateSignupLink: async (input) => {
        const { data, error } = await admin.auth.admin.generateLink({
          type: "signup",
          email: input.email,
          password: input.password,
          options: {
            data: input.displayName ? { display_name: input.displayName } : undefined,
            redirectTo: input.redirectTo,
          },
        });
        if (error || !data.properties.hashed_token) {
          return { ok: false, error: error ?? new Error("Missing verification token") };
        }
        return {
          ok: true,
          userId: data.user.id,
          hashedToken: data.properties.hashed_token,
        };
      },
      sendVerification: sendAccountVerification,
      deleteAuthUser: async (userId) => {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw error;
      },
      confirmationUrl: (tokenHash) => accountConfirmationUrl(tokenHash, "signup", next),
      reportExistingClaimFailure: (error) => {
        reportServerError("auth.password_claim.existing_user_failed", error, {
          provider: "supabase",
          source: "createPasswordAccount",
        });
      },
      reportLinkGenerationFailure: (error) => {
        reportServerError("auth.password_signup.link_generation_failed", error, {
          provider: "supabase",
          source: "createPasswordAccount",
        });
      },
      reportVerificationEmailFailure: (error) => {
        reportServerError("auth.password_signup.email_failed", error, {
          provider: "resend",
          source: "createPasswordAccount",
        });
      },
      reportSignupCleanupFailure: (error) => {
        reportServerError("auth.password_signup.cleanup_failed", error, {
          provider: "supabase",
          source: "createPasswordAccount",
        });
      },
    },
  );
  if (result.kind === "redirect") redirect(result.path);
  return result.state;
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

async function authActionAllowed(
  scope: string,
  email: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const address = clientAddressFromHeaders(await headers());
    const [addressLimit, emailLimit] = await Promise.all([
      consumeRateLimit(`${scope}-address`, address, { limit, windowSeconds }),
      consumeRateLimit(`${scope}-email`, email, { limit, windowSeconds }),
    ]);
    return addressLimit.allowed && emailLimit.allowed;
  } catch (error) {
    reportServerError("auth.rate_limit.failed", error, {
      provider: "supabase",
      source: scope,
    });
    return false;
  }
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
