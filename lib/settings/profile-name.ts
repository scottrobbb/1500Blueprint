export const PROFILE_NAME_MIN_LENGTH = 2;
export const PROFILE_NAME_MAX_LENGTH = 80;

// Reserved for the site owner's own account (see ADMIN_EMAILS / isAdminEmail)
// so other members can't impersonate them in the community.
const CROWN_EMOJI = "\u{1F451}";
const RESERVED_NAME_PATTERN = /scott\s*robinson/i;

export type ProfileNameValidation =
  | { valid: true; name: string }
  | { valid: false; error: "invalid_name"; message: string };

export function validateProfileName(value: unknown, options?: { allowReserved?: boolean }): ProfileNameValidation {
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
  if (!options?.allowReserved && (name.includes(CROWN_EMOJI) || RESERVED_NAME_PATTERN.test(name))) {
    return {
      valid: false,
      error: "invalid_name",
      message: "That name isn't available.",
    };
  }

  return { valid: true, name };
}
