import "server-only";

import { reportServerError } from "@/lib/observability/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import type { FreeAttribution } from "./attribution";
import {
  runFreeRegistrationNotice,
  type FreeRegistrationNotice,
  type FreeRegistrationPayload,
} from "./free-registration-workflow";

// Server-only by construction: the Zapier URL is a credential -- anyone
// holding it can write into the ad account's conversion feed -- so it is read
// here and nowhere a client bundle can reach.
//
// The timeout is short because this runs while the student waits on the signup
// form. Zapier answers a catch hook in a few hundred milliseconds; anything
// slower is a blip, and a blip must not hold up the confirmation screen.
const WEBHOOK_TIMEOUT_MS = 3_000;

export function freeRegisterWebhookUrl(): string | null {
  const configured = process.env.ZAPIER_FREE_REGISTER_WEBHOOK_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    // Student names and emails are in the payload; never send them in the clear.
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// Called once the registration completes on the site: the account exists and
// the verification email has been sent. Never throws -- a marketing event is
// not worth failing a registration that already succeeded.
export async function notifyFreeRegistration(notice: FreeRegistrationNotice): Promise<void> {
  try {
    await runFreeRegistrationNotice(
      {
        email: notice.email.trim().toLowerCase(),
        name: notice.name.trim(),
        attribution: notice.attribution,
      },
      {
        webhookUrl: freeRegisterWebhookUrl,
        claimConversion,
        post: postRegistration,
        reportFailure: (error) => {
          reportServerError("marketing.free_registration.notice_failed", error, {
            provider: "zapier",
            source: "notifyFreeRegistration",
          });
        },
      },
    );
  } catch (error) {
    reportServerError("marketing.free_registration.notice_failed", error, {
      provider: "zapier",
      source: "notifyFreeRegistration",
    });
  }
}

async function claimConversion(
  email: string,
  attribution: FreeAttribution,
): Promise<FreeAttribution | null> {
  const { data, error } = await supabaseAdmin().rpc("claim_free_registration_notice", {
    p_email: email,
    p_fbclid: attribution.fbclid,
    p_utm_medium: attribution.utm_medium,
  });
  if (error) throw new Error(`failed to claim free registration notice: ${error.message}`);
  if (!data || typeof data !== "object") return null;

  const claimed = data as { fbclid?: unknown; utm_medium?: unknown };
  return {
    fbclid: typeof claimed.fbclid === "string" ? claimed.fbclid : null,
    utm_medium: typeof claimed.utm_medium === "string" ? claimed.utm_medium : null,
  };
}

async function postRegistration(url: string, payload: FreeRegistrationPayload): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Zapier rejected the free registration event (${response.status})`);
  }
}
