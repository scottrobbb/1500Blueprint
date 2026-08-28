import "server-only";

import { createHash } from "node:crypto";
import { reportServerError } from "@/lib/observability/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { parseRateLimitResult, type RateLimitResult } from "./rate-limit-result";

export async function consumeRateLimit(
  scope: string,
  discriminator: string,
  options: { limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const keyHash = createHash("sha256")
    .update(`${scope}\u0000${discriminator}`)
    .digest("hex");
  const { data, error } = await supabaseAdmin().rpc("consume_api_rate_limit", {
    p_key_hash: keyHash,
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
  });
  if (error) throw error;
  return parseRateLimitResult(data);
}

/**
 * Checks a distributed limit without allowing a rate-limit storage outage to
 * turn into an unbounded write path. Callers distinguish unavailable (`null`)
 * from an exhausted quota and return 503 or 429 respectively.
 */
export async function checkRateLimit(
  scope: string,
  discriminator: string,
  options: { limit: number; windowSeconds: number },
): Promise<RateLimitResult | null> {
  try {
    return await consumeRateLimit(scope, discriminator, options);
  } catch (error) {
    reportServerError("security.rate_limit.unavailable", error, {
      provider: "supabase",
      source: scope,
    });
    return null;
  }
}
