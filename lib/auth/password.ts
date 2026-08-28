export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_SIGNUP_ATTEMPT_LIMIT = 3;
const PREVIEW_PASSWORD_SIGNUP_ATTEMPT_LIMIT = 50;

export type PasswordValidation =
  | { valid: true }
  | { valid: false; message: string };

export function isPasswordAuthEnabled(): boolean {
  const configured = process.env.PASSWORD_AUTH_ENABLED;
  if (configured === "true") return true;
  if (configured === "false") return false;
  return process.env.NODE_ENV === "development";
}

export function isPasswordSignupEnabled(): boolean {
  if (!isPasswordAuthEnabled()) return false;
  const configured = process.env.PASSWORD_SIGNUP_ENABLED;
  if (configured === "true") return true;
  if (configured === "false") return false;
  return process.env.NODE_ENV === "development";
}

export function passwordSignupAttemptLimit(
  vercelEnvironment = process.env.VERCEL_ENV,
): number {
  return vercelEnvironment === "preview"
    ? PREVIEW_PASSWORD_SIGNUP_ATTEMPT_LIMIT
    : PASSWORD_SIGNUP_ATTEMPT_LIMIT;
}

export function normalizeEmail(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(password: string): PasswordValidation {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      message: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      valid: false,
      message: `Use ${PASSWORD_MAX_LENGTH} characters or fewer.`,
    };
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { valid: false, message: "Include at least one letter and one number." };
  }
  return { valid: true };
}

export function safeNextPath(value: FormDataEntryValue | string | null): string {
  if (typeof value !== "string") return "/drills";
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return "/drills";
  }
  return path;
}
