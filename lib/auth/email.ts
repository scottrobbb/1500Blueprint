import "server-only";

import { sendTrackedEmail } from "@/lib/email/send";
import { authLinkEmail } from "@/lib/email/templates";

export async function sendMagicLink(email: string, url: string, tokenId: string): Promise<void> {
  await sendTrackedEmail({
    kind: "magic_link",
    to: email,
    idempotencyKey: `magic-link/${tokenId}`,
    message: authLinkEmail({
      subject: "Your 1500 Blueprint login link",
      preview: "This secure login link expires in 15 minutes.",
      heading: "Sign in to your account",
      introduction: "Use the secure link below to continue studying. It works once and expires in 15 minutes.",
      buttonLabel: "Log in to 1500 Blueprint",
      url,
      securityNote: "If you did not request this login, you can ignore this email.",
    }),
  });
}

export async function sendAccountVerification(email: string, url: string, userId: string): Promise<void> {
  await sendTrackedEmail({
    kind: "signup_verification",
    to: email,
    idempotencyKey: `signup-verification/${userId}`,
    message: authLinkEmail({
      subject: "Verify your 1500 Blueprint account",
      preview: "Verify your email to finish creating your account.",
      heading: "Verify your email",
      introduction: "Confirm your email address to finish setting up your password login.",
      buttonLabel: "Verify email",
      url,
      securityNote: "If you did not create this account, you can ignore this email.",
    }),
  });
}

export async function sendPasswordReset(email: string, url: string, requestId: string): Promise<void> {
  await sendTrackedEmail({
    kind: "password_reset",
    to: email,
    idempotencyKey: `password-reset/${requestId}`,
    message: authLinkEmail({
      subject: "Reset your 1500 Blueprint password",
      preview: "Use this secure link to choose a new password.",
      heading: "Reset your password",
      introduction: "Use the secure link below to choose a new password.",
      buttonLabel: "Reset password",
      url,
      securityNote: "If you did not request a password reset, you can ignore this email.",
    }),
  });
}
