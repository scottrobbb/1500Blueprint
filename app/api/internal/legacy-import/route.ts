import { timingSafeEqual } from "node:crypto";
import type Stripe from "stripe";
import { billingCheckoutEnabled, billingLivemode } from "@/lib/billing/config";
import { billingStripe } from "@/lib/billing/stripe";
import { stripeSubscriptionPlan, syncStripeSubscription } from "@/lib/billing/subscriptions";
import { selectLegacyImportCustomer } from "@/lib/billing/workflow";
import { reportServerError } from "@/lib/observability/server";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/security/request";
import { supabaseAdmin } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BODY_BYTES = 16 * 1024;

type AccountRow = {
  id: string;
  email: string;
  stripe_live_customer_id: string | null;
};

type MappedSubscription = {
  subscription: Stripe.Subscription;
  plan: "core" | "max";
};

type CustomerMatch = {
  customer: Stripe.Customer;
  subscriptions: MappedSubscription[];
};

type SubscriberMatch = {
  email: string;
  account: AccountRow | null;
  customers: CustomerMatch[];
};

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) return Response.json({ error: "Not found" }, { status: 404 });
  if (!billingLivemode() || billingCheckoutEnabled()) {
    return Response.json({ error: "Legacy import is unavailable" }, { status: 409 });
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

  const apply = body.apply === true;
  const skippedEmails = normalizeSkippedEmails(body.skipEmails);
  if (!skippedEmails) return Response.json({ error: "Invalid request" }, { status: 400 });

  try {
    const result = await reconcileLegacySubscribers({ apply, skippedEmails });
    return Response.json(result, { status: result.blocked ? 409 : 200 });
  } catch (error) {
    reportServerError("billing.legacy_import.failed", error, {
      provider: "stripe",
      route: "/api/internal/legacy-import",
      method: "POST",
    });
    return Response.json({ error: "Legacy import failed" }, { status: 500 });
  }
}

async function reconcileLegacySubscribers({
  apply,
  skippedEmails,
}: {
  apply: boolean;
  skippedEmails: Set<string>;
}) {
  const db = supabaseAdmin();
  const { data: accounts, error: accountError } = await db
    .from("users")
    .select("id,email,stripe_live_customer_id")
    .returns<AccountRow[]>();
  if (accountError) throw new Error(`Could not load Blueprint accounts: ${accountError.message}`);

  const accountByEmail = new Map(
    (accounts ?? []).map((account) => [account.email.trim().toLowerCase(), account]),
  );
  const matchesByEmail = new Map<string, SubscriberMatch>();
  let customersScanned = 0;
  let subscriptionsMapped = 0;

  for await (const customer of billingStripe().customers.list({ limit: 100 })) {
    customersScanned += 1;
    if (customer.deleted || !customer.email) continue;
    const email = customer.email.trim().toLowerCase();
    if (skippedEmails.has(email)) continue;

    const subscriptions: MappedSubscription[] = [];
    for await (const subscription of billingStripe().subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 100,
    })) {
      const plan = stripeSubscriptionPlan(subscription);
      if (!plan) continue;
      subscriptionsMapped += 1;
      subscriptions.push({ subscription, plan });
    }
    if (!subscriptions.length) continue;

    const match = matchesByEmail.get(email) ?? {
      email,
      account: accountByEmail.get(email) ?? null,
      customers: [],
    };
    match.customers.push({ customer, subscriptions });
    matchesByEmail.set(email, match);
  }

  const selections = [...matchesByEmail.values()].map((match) => {
    const selection = selectLegacyImportCustomer(
      match.customers.flatMap(({ customer, subscriptions }) => subscriptions.map(({ subscription }) => ({
        customerId: customer.id,
        subscriptionId: subscription.id,
        status: subscription.status,
        created: subscription.created,
      }))),
      match.account?.stripe_live_customer_id ?? null,
    );
    return { match, selection };
  });
  const duplicateActiveSubscriptions = selections.filter(
    ({ selection }) => selection.activeSubscriptionCount > 1,
  ).length;
  const linkedCustomerMismatches = selections.filter(
    ({ selection }) => selection.linkedCustomerMismatch,
  ).length;
  const accountsToCreate = selections.filter(({ match }) => !match.account).length;
  const blocked = duplicateActiveSubscriptions > 0 || linkedCustomerMismatches > 0;

  const summary = {
    mode: apply ? "apply" : "dry-run",
    customersScanned,
    subscriberEmails: matchesByEmail.size,
    accountsToCreate,
    subscriptionsMapped,
    skippedForManualReview: skippedEmails.size,
    duplicateActiveSubscriptions,
    linkedCustomerMismatches,
    blocked,
  };
  if (!apply || blocked) return { ...summary, accountsApplied: 0, subscriptionsApplied: 0 };

  let accountsApplied = 0;
  let subscriptionsApplied = 0;
  for (const { match, selection } of selections) {
    if (!selection.customerId) continue;
    const selectedCustomer = match.customers.find(
      ({ customer }) => customer.id === selection.customerId,
    );
    if (!selectedCustomer) throw new Error("Selected Stripe customer was not found");

    const account = await ensureAccount(match);
    const { error: customerError } = await db
      .from("users")
      .update({ stripe_live_customer_id: selectedCustomer.customer.id, updated_at: new Date().toISOString() })
      .eq("id", account.id);
    if (customerError) throw new Error(`Could not link Stripe customer: ${customerError.message}`);

    for (const { subscription } of selectedCustomer.subscriptions.sort(
      (a, b) => a.subscription.created - b.subscription.created,
    )) {
      await syncStripeSubscription(subscription, account.id);
      subscriptionsApplied += 1;
    }
    accountsApplied += 1;
  }

  return { ...summary, accountsApplied, subscriptionsApplied };
}

async function ensureAccount(match: SubscriberMatch): Promise<AccountRow> {
  if (match.account) return match.account;
  const db = supabaseAdmin();
  const { data: inserted, error: insertError } = await db
    .from("users")
    .insert({ email: match.email, plan: "free" })
    .select("id,email,stripe_live_customer_id")
    .maybeSingle<AccountRow>();
  if (insertError && insertError.code !== "23505") {
    throw new Error(`Could not create Blueprint account: ${insertError.message}`);
  }
  if (inserted) {
    match.account = inserted;
    return inserted;
  }

  const { data: existing, error: existingError } = await db
    .from("users")
    .select("id,email,stripe_live_customer_id")
    .eq("email", match.email)
    .single<AccountRow>();
  if (existingError || !existing) {
    throw new Error(`Could not reload Blueprint account: ${existingError?.message ?? "missing account"}`);
  }
  match.account = existing;
  return existing;
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

function normalizeSkippedEmails(value: unknown): Set<string> | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const emails = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    const email = entry.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    emails.add(email);
  }
  return emails;
}
