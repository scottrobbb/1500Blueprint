"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import {
  grantComplimentaryAccess,
  normalizeComplimentaryEmail,
  revokeComplimentaryAccess,
} from "@/lib/auth/users";
import { reportServerError } from "@/lib/observability/server";

export type AccessActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function grantComplimentaryAccessAction(
  _previousState: AccessActionState,
  formData: FormData,
): Promise<AccessActionState> {
  if (!(await getAdminSession())) {
    return { status: "error", message: "Your admin session expired. Sign in again." };
  }

  const email = normalizeComplimentaryEmail(String(formData.get("email") ?? ""));
  if (!email) return { status: "error", message: "Enter a valid email address." };

  try {
    const { alreadyGranted } = await grantComplimentaryAccess(email);
    revalidatePath("/admin/access");
    return {
      status: "success",
      message: alreadyGranted
        ? `${email} already has complimentary access.`
        : `Complimentary access granted to ${email}.`,
    };
  } catch (error) {
    reportServerError("admin.complimentary_access.grant_failed", error, {
      provider: "supabase",
      source: "admin-access-action",
    });
    return { status: "error", message: "Could not grant access. Try again." };
  }
}

export async function revokeComplimentaryAccessAction(
  email: string,
): Promise<AccessActionState> {
  if (!(await getAdminSession())) {
    return { status: "error", message: "Your admin session expired. Sign in again." };
  }

  const normalizedEmail = normalizeComplimentaryEmail(email);
  if (!normalizedEmail) return { status: "error", message: "That email is invalid." };

  try {
    const revoked = await revokeComplimentaryAccess(normalizedEmail);
    revalidatePath("/admin/access");
    return revoked
      ? { status: "success", message: `Complimentary access revoked for ${normalizedEmail}.` }
      : { status: "error", message: `${normalizedEmail} no longer has complimentary access.` };
  } catch (error) {
    reportServerError("admin.complimentary_access.revoke_failed", error, {
      provider: "supabase",
      source: "admin-access-action",
    });
    return { status: "error", message: "Could not revoke access. Try again." };
  }
}
