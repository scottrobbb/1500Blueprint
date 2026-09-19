// Remembers that a student closed the "harder than the real SAT" warning on the
// test library pages. A cookie rather than localStorage so the server can leave
// the banner out entirely instead of flashing it until hydration hides it.
export const DIFFICULTY_WARNING_COOKIE = "bp-test-warning-dismissed";

// Browsers cap cookie lifetimes at 400 days, so ask for the cap.
const DIFFICULTY_WARNING_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

export function difficultyWarningDismissedCookie(): string {
  return `${DIFFICULTY_WARNING_COOKIE}=1; path=/; max-age=${DIFFICULTY_WARNING_COOKIE_MAX_AGE}; SameSite=Lax`;
}
