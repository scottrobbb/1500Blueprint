export const PROFILE_NAME_MIN_LENGTH = 2;
export const PROFILE_NAME_MAX_LENGTH = 80;

export type ProfileNameValidation =
  | { valid: true; name: string }
  | { valid: false; error: "invalid_name"; message: string };

export function validateProfileName(value: unknown): ProfileNameValidation {
  if (typeof value !== "string") {
    return {
      valid: false,
      error: "invalid_name",
      message: "Enter a valid display name.",
    };
  }

  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < PROFILE_NAME_MIN_LENGTH) {
    return {
      valid: false,
      error: "invalid_name",
      message: `Use at least ${PROFILE_NAME_MIN_LENGTH} characters.`,
    };
  }
  if (name.length > PROFILE_NAME_MAX_LENGTH) {
    return {
      valid: false,
      error: "invalid_name",
      message: `Use ${PROFILE_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }

  return { valid: true, name };
}
