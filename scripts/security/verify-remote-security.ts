/**
 * Aggregate-only hosted security verification. This intentionally fetches no
 * protected row bodies and never prints identifiers or credentials.
 *
 * Run after the coordinated database/application release:
 *   npm run security:verify:remote
 */
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

const DIRECT_DENIAL_TABLES = [
  "tests",
  "modules",
  "questions",
  "choices",
  "drills",
  "drill_questions",
  "drill_walkthrough_steps",
  "users",
  "student_subscriptions",
  "billing_webhook_events",
] as const;

const ZERO_HEALTH_KEYS = [
  "duplicateNormalizedEmailGroups",
  "authIdentityEmailMismatches",
  "subscriptionCustomerMismatches",
  "duplicateActiveSubscriptionGroups",
  "invalidSubscriptionPlans",
  "invalidSubscriptionStatuses",
  "failedWebhookEvents",
  "expiredWebhookLeases",
] as const;

type Failure = { check: string; detail: string };

async function main() {
  loadEnvConfig(process.cwd());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishableKey || !secretKey) {
    throw new Error("Supabase security-verification environment is incomplete");
  }

  const clientOptions = {
    auth: { persistSession: false, autoRefreshToken: false },
  } as const;
  const anonymous = createClient(url, publishableKey, clientOptions);
  const admin = createClient(url, secretKey, clientOptions);
  const failures: Failure[] = [];

  for (const table of DIRECT_DENIAL_TABLES) {
    const result = await anonymous.from(table).select("*", { head: true, count: "exact" });
    if (!result.error) {
      failures.push({
        check: `anonymous:${table}`,
        detail: `direct request succeeded (${result.count ?? 0} visible rows)`,
      });
    }
  }

  const anonymousHealth = await anonymous.rpc("get_billing_integrity_health");
  if (!anonymousHealth.error) {
    failures.push({
      check: "anonymous:get_billing_integrity_health",
      detail: "server-only RPC execution succeeded",
    });
  }

  const health = await admin.rpc("get_billing_integrity_health");
  if (health.error || !isRecord(health.data)) {
    failures.push({ check: "billing-integrity", detail: "health RPC is unavailable" });
  } else {
    for (const key of ZERO_HEALTH_KEYS) {
      const value = Number(health.data[key]);
      if (!Number.isSafeInteger(value) || value !== 0) {
        failures.push({
          check: `billing-integrity:${key}`,
          detail: Number.isSafeInteger(value) ? `count is ${value}` : "count is invalid",
        });
      }
    }
  }

  const [courseAssets, figures] = await Promise.all([
    admin.storage.getBucket("course-assets"),
    admin.storage.getBucket("figures"),
  ]);
  if (
    courseAssets.error
    || courseAssets.data.public
    || courseAssets.data.file_size_limit !== 524_288_000
    || !includesAll(courseAssets.data.allowed_mime_types, ["application/pdf", "image/png", "video/mp4"])
  ) {
    failures.push({ check: "storage:course-assets", detail: "private bucket policy does not match the release invariant" });
  }
  if (
    figures.error
    || !figures.data.public
    || figures.data.file_size_limit !== 10_485_760
    || !includesAll(figures.data.allowed_mime_types, ["image/png", "image/jpeg", "image/webp"])
  ) {
    failures.push({ check: "storage:figures", detail: "public media bucket policy does not match the release invariant" });
  }

  console.log(JSON.stringify({
    verified: failures.length === 0,
    checks: DIRECT_DENIAL_TABLES.length + ZERO_HEALTH_KEYS.length + 4,
    failures,
  }, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function includesAll(actual: string[] | null | undefined, required: string[]): boolean {
  return Boolean(actual && required.every((mime) => actual.includes(mime)));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    verified: false,
    error: error instanceof Error ? error.name : "UnknownError",
  }));
  process.exitCode = 1;
});
