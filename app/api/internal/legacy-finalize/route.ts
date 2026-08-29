import { timingSafeEqual } from "node:crypto";
import { billingCheckoutEnabled, billingLivemode } from "@/lib/billing/config";
import { billingStripe } from "@/lib/billing/stripe";
import { stripeSubscriptionPlan, syncStripeSubscription } from "@/lib/billing/subscriptions";
import { reportServerError } from "@/lib/observability/server";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/security/request";
import { supabaseAdmin } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY_BYTES = 8 * 1024;

type Target = { email: string; subscriptionId: string };
type AccountRow = { id: string; email: string };

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) return Response.json({ error: "Not found" }, { status: 404 });
  if (!billingLivemode() || billingCheckoutEnabled()) {
    return Response.json({ error: "Legacy finalization is unavailable" }, { status: 409 });
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request, MAX_BODY_BYTES) as Record<string, unknown>;
  } catch (error) {
    return Response.json(
      { error: "Invalid request" },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
  }
  const targets = parseTargets(body.targets);
  if (!targets) return Response.json({ error: "Invalid request" }, { status: 400 });

  try {
    const results = [];
    for (const target of targets) results.push(await finalizeTarget(target));
    return Response.json({ finalized: results });
  } catch (error) {
    reportServerError("billing.legacy_finalize.failed", error, {
      provider: "stripe",
      route: "/api/internal/legacy-finalize",
      method: "POST",
    });
    return Response.json({ error: "Legacy finalization failed" }, { status: 500 });
  }
}

async function finalizeTarget(target: Target) {
  const subscription = await billingStripe().subscriptions.retrieve(target.subscriptionId);
  if (!subscription.livemode || stripeSubscriptionPlan(subscription) !== "max") {
    throw new Error("Legacy subscription is not a live Max entitlement");
  }
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
  const customer = await billingStripe().customers.retrieve(customerId);
  if (customer.deleted || customer.email?.trim().toLowerCase() !== target.email) {
    throw new Error("Legacy subscription email does not match the Blueprint account");
  }

  const account = await ensureAccount(target.email);
  const { error } = await supabaseAdmin()
    .from("users")
    .update({ stripe_live_customer_id: customerId, updated_at: new Date().toISOString() })
    .eq("id", account.id);
  if (error) throw new Error(`Could not link Stripe customer: ${error.message}`);
  await syncStripeSubscription(subscription, account.id);
  return { status: subscription.status, plan: "max" as const };
}

async function ensureAccount(email: string): Promise<AccountRow> {
  const db = supabaseAdmin();
  const current = await db
    .from("users")
    .select("id,email")
    .eq("email", email)
    .maybeSingle<AccountRow>();
  if (current.error) throw new Error(`Could not load Blueprint account: ${current.error.message}`);
  if (current.data) return current.data;

  const created = await db
    .from("users")
    .insert({ email, plan: "free" })
    .select("id,email")
    .single<AccountRow>();
  if (created.error || !created.data) {
    throw new Error(`Could not create Blueprint account: ${created.error?.message ?? "missing account"}`);
  }
  return created.data;
}

function parseTargets(value: unknown): Target[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 3) return null;
  const targets: Target[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
    const subscriptionId = typeof row.subscriptionId === "string" ? row.subscriptionId.trim() : "";
    if (
      email.length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)
    ) return null;
    targets.push({ email, subscriptionId });
  }
  return targets;
}

function authorized(request: Request): boolean {
  const expected = process.env.LEGACY_IMPORT_RUN_TOKEN?.trim();
  const authorization = request.headers.get("authorization");
  const provided = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length
    && timingSafeEqual(expectedBytes, providedBytes);
}
