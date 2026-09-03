import type { FreeAttribution } from "./attribution";

// The Meta conversion event for a completed Free registration, as its own
// dependency-injected workflow so the duplicate guard is testable without a
// database or an outbound request.

export type FreeRegistrationNotice = {
  email: string;
  name: string;
  // What the /free cookie carried on this registration, or null when the
  // student never came through the landing page.
  attribution: FreeAttribution | null;
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
  | "already-sent"
  | "failed";

export type FreeRegistrationDependencies = {
  webhookUrl(): string | null;
  // Stores this registration's attribution and claims its conversion event in
  // one write, returning what to send. Returns null when the event was already
  // claimed by an earlier registration attempt for the same address.
  claimConversion(
    email: string,
    attribution: FreeAttribution,
  ): Promise<FreeAttribution | null>;
  post(url: string, payload: FreeRegistrationPayload): Promise<void>;
  reportFailure(error: unknown): void;
};

export async function runFreeRegistrationNotice(
  notice: FreeRegistrationNotice,
  dependencies: FreeRegistrationDependencies,
): Promise<FreeRegistrationOutcome> {
  const url = dependencies.webhookUrl();
  if (!url) return "not-configured";
  // No cookie means this registration started somewhere other than /free --
  // the pricing page, the Max page, the footer link -- and is not a landing
  // page conversion.
  if (!notice.attribution) return "no-attribution";

  // Claiming before posting is what makes a repeated registration safe: the
  // claim is a single conditional write, so a second attempt for the same
  // address stores its attribution and sends nothing.
  let claimed: FreeAttribution | null;
  try {
    claimed = await dependencies.claimConversion(notice.email, notice.attribution);
  } catch (error) {
    dependencies.reportFailure(error);
    return "failed";
  }
  if (!claimed) return "already-sent";

  try {
    await dependencies.post(url, {
      name: notice.name,
      email: notice.email,
      fbclid: claimed.fbclid,
      utm_medium: claimed.utm_medium,
    });
  } catch (error) {
    // The claim is deliberately left in place. A duplicate conversion inflates
    // the ad account's numbers and skews its optimization, which is a worse
    // outcome than a single event lost to a network blip.
    dependencies.reportFailure(error);
    return "failed";
  }

  return "sent";
}
