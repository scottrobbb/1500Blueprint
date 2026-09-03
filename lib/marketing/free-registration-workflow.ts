import type { FreeAttribution } from "./attribution";

// The Meta conversion event for a completed Free registration, as its own
// dependency-injected workflow so the duplicate guard is testable without a
// database or an outbound request.

export type FreeRegistrationNotice = {
  email: string;
  name: string;
};

export type FreeRegistrationPayload = {
  name: string;
  email: string;
  fbclid: string | null;
  utm_medium: string | null;
};

export type FreeRegistrationOutcome =
  | "sent"
  | "not-configured"
  | "no-attribution"
  | "failed";

export type FreeRegistrationDependencies = {
  webhookUrl(): string | null;
  // Marks the stored attribution as notified and returns it, or returns null
  // when there is nothing to claim. Must be a single conditional write.
  claimAttribution(email: string): Promise<FreeAttribution | null>;
  post(url: string, payload: FreeRegistrationPayload): Promise<void>;
  reportFailure(error: unknown): void;
};

export async function runFreeRegistrationNotice(
  notice: FreeRegistrationNotice,
  dependencies: FreeRegistrationDependencies,
): Promise<FreeRegistrationOutcome> {
  const url = dependencies.webhookUrl();
  if (!url) return "not-configured";

  // Claiming before posting is what makes this safe to reach more than once: a
  // replayed confirmation finds the row already claimed and sends nothing. A
  // row exists at all only for a registration that started on /free, so
  // signups from /pricing, /max, or the footer link never fire.
  let attribution: FreeAttribution | null;
  try {
    attribution = await dependencies.claimAttribution(notice.email);
  } catch (error) {
    dependencies.reportFailure(error);
    return "failed";
  }
  if (!attribution) return "no-attribution";

  try {
    await dependencies.post(url, {
      name: notice.name,
      email: notice.email,
      fbclid: attribution.fbclid,
      utm_medium: attribution.utm_medium,
    });
  } catch (error) {
    // The claim is deliberately left in place. The confirmation token is
    // single-use, so there is no second delivery to retry with, and releasing
    // the claim would only open a window for a duplicate conversion.
    dependencies.reportFailure(error);
    return "failed";
  }

  return "sent";
}
