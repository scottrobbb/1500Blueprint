/**
 * Reconcile legacy Stripe customers/subscriptions into the additive account model.
 * Dry-run is the default. Writes require both --apply and ALLOW_STRIPE_IMPORT_WRITE=true.
 *
 * npx tsx scripts/billing/import-legacy-stripe.ts --mode=live
 * npx tsx scripts/billing/import-legacy-stripe.ts --mode=live --email=student@example.com
 * STRIPE_LEGACY_MAX_PRODUCT_IDS=products_variant_... npx tsx scripts/billing/import-legacy-stripe.ts --mode=live
 * ALLOW_STRIPE_IMPORT_WRITE=true npx tsx scripts/billing/import-legacy-stripe.ts --mode=live --apply
 */
import * as fs from "node:fs";
import * as path from "node:path";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import {
  legacyImportBlockingReasons,
  selectLegacyImportCustomer,
} from "../../lib/billing/workflow";

function loadEnv(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadEnv(path.resolve(".env.local"));

type Plan = "core" | "max";
type Account = {
  id: string;
  email: string;
  plan: string | null;
  stripe_test_customer_id: string | null;
  stripe_live_customer_id: string | null;
};
type MappedSubscription = { subscription: Stripe.Subscription; plan: Plan };
type CustomerMatch = { customer: Stripe.Customer; subscriptions: MappedSubscription[] };
type AccountMatch = { email: string; account: Account | null; customers: CustomerMatch[] };

const args = process.argv.slice(2);
const mode = importMode(option("mode"));
const apply = args.includes("--apply");
const includeEmails = args.includes("--include-emails");
const requestedEmail = option("email");
const targetEmail = requestedEmail ? normalizeEmail(requestedEmail) : null;
const stripeKey = mode === "test"
  ? process.env.STRIPE_BILLING_KEY
  : process.env.STRIPE_RESTRICTED_KEY ?? process.env.STRIPE_LEGACY_KEY;
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const configuredPrices = new Map<string, Plan>([
  [option("core-price") ?? process.env.STRIPE_CORE_PRICE_ID ?? "", "core"],
  [process.env.STRIPE_CORE_THREE_MONTH_PRICE_ID ?? "", "core"],
  [option("max-price") ?? process.env.STRIPE_MAX_PRICE_ID ?? "", "max"],
  [process.env.STRIPE_MAX_THREE_MONTH_PRICE_ID ?? "", "max"],
].filter(([price]) => Boolean(price)) as [string, Plan][]);
const configuredProducts = new Map<string, Plan>([
  ...configuredIds(option("core-products") ?? process.env.STRIPE_LEGACY_CORE_PRODUCT_IDS).map(
    (productId) => [productId, "core"] as const,
  ),
  ...configuredIds(option("max-products") ?? process.env.STRIPE_LEGACY_MAX_PRODUCT_IDS).map(
    (productId) => [productId, "max"] as const,
  ),
]);

if (!stripeKey || !supabaseUrl || !supabaseKey) {
  throw new Error("Stripe and Supabase service credentials are required");
}
if (requestedEmail && !targetEmail) {
  throw new Error("--email must be a valid email address");
}
if (!stripeKey.includes(`_${mode}_`)) {
  throw new Error(`The Stripe key does not match --mode=${mode}`);
}
if (apply && process.env.ALLOW_STRIPE_IMPORT_WRITE !== "true") {
  throw new Error("Set ALLOW_STRIPE_IMPORT_WRITE=true together with --apply to authorize writes");
}

const stripe = new Stripe(stripeKey, { maxNetworkRetries: 2 });
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
const productPlans = new Map<string, Plan | null>();

async function main() {
  const { data: accounts, error } = await supabase
    .from("users")
    .select("id,email,plan,stripe_test_customer_id,stripe_live_customer_id")
    .returns<Account[]>();
  if (error) throw error;
  const accountByEmail = new Map((accounts ?? []).map((account) => [account.email.toLowerCase(), account]));

  let customersScanned = 0;
  let customersMatched = 0;
  let subscriptionsMapped = 0;
  let subscriptionsUnknown = 0;
  const unknownPrices = new Set<string>();
  const matchesByEmail = new Map<string, AccountMatch>();
  const paidStatuses = new Set(["active", "trialing", "past_due"]);

  const customerList: Stripe.CustomerListParams = {
    limit: 100,
    ...(targetEmail ? { email: targetEmail } : {}),
  };
  for await (const customer of stripe.customers.list(customerList)) {
    customersScanned += 1;
    if (customer.deleted || !customer.email) continue;
    const email = customer.email.trim().toLowerCase();
    const account = accountByEmail.get(email) ?? null;

    const mappedForCustomer: MappedSubscription[] = [];
    for await (const subscription of stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 100 })) {
      const plan = await planForSubscription(subscription);
      if (!plan) {
        if (account && hasLegacyBillingMarker(account.plan) && paidStatuses.has(subscription.status)) {
          subscriptionsUnknown += 1;
          const priceId = subscription.items.data[0]?.price.id;
          if (priceId) unknownPrices.add(priceId);
        }
        continue;
      }
      subscriptionsMapped += 1;
      mappedForCustomer.push({ subscription, plan });
    }
    if (!mappedForCustomer.length) continue;

    if (account) customersMatched += 1;
    const match = matchesByEmail.get(email) ?? { email, account, customers: [] };
    match.customers.push({ customer, subscriptions: mappedForCustomer });
    matchesByEmail.set(email, match);
  }

  const customersWithMultipleMatches = [...matchesByEmail.values()]
    .filter((match) => match.customers.length > 1)
    .length;
  const selections = [...matchesByEmail.values()].map((match) => {
    const linkedCustomerId = mode === "live"
      ? match.account?.stripe_live_customer_id ?? null
      : match.account?.stripe_test_customer_id ?? null;
    const selection = selectLegacyImportCustomer(
      match.customers.flatMap(({ customer, subscriptions }) => subscriptions.map(({ subscription }) => ({
        customerId: customer.id,
        subscriptionId: subscription.id,
        status: subscription.status,
        created: subscription.created,
      }))),
      linkedCustomerId,
    );
    return { match, selection };
  });
  const duplicateActiveSubscriptionAccounts = selections
    .filter(({ selection }) => selection.activeSubscriptionCount > 1)
    .length;
  const linkedCustomerMismatches = selections
    .filter(({ selection }) => selection.linkedCustomerMismatch)
    .length;
  const accountsToCreate = selections.filter(({ match }) => !match.account).length;
  const blockers = legacyImportBlockingReasons({
    duplicateActiveSubscriptionAccounts,
    linkedCustomerMismatches,
    unknownSubscriptions: subscriptionsUnknown,
  });

  console.log(`Mode: ${mode}; write mode: ${apply ? "APPLY" : "DRY RUN"}`);
  if (targetEmail) console.log(`Target: ${targetEmail}`);
  console.log(`Stripe customers scanned: ${customersScanned}`);
  console.log(`Relevant Stripe customers matched to Blueprint accounts: ${customersMatched}`);
  console.log(`Blueprint subscriber emails found: ${matchesByEmail.size}`);
  console.log(`Blueprint accounts to create: ${accountsToCreate}`);
  console.log(`Accounts with multiple Stripe customer matches: ${customersWithMultipleMatches}`);
  console.log(`Accounts with multiple active Stripe subscriptions: ${duplicateActiveSubscriptionAccounts}`);
  console.log(`Accounts linked to a different Stripe customer: ${linkedCustomerMismatches}`);
  console.log(`Subscriptions mapped to Core/Max: ${subscriptionsMapped}`);
  console.log(`Active legacy-account subscriptions requiring a price mapping: ${subscriptionsUnknown}`);
  if (unknownPrices.size) console.log(`Unknown price IDs: ${[...unknownPrices].sort().join(", ")}`);
  if (includeEmails) {
    for (const { match, selection } of selections) {
      if (selection.activeSubscriptionCount <= 1 && !selection.linkedCustomerMismatch) continue;
      const active = match.customers.flatMap(({ customer, subscriptions }) => subscriptions
        .filter(({ subscription }) => paidStatuses.has(subscription.status))
        .map(({ subscription, plan }) => ({
          customer: customer.id,
          subscription: subscription.id,
          plan,
          status: subscription.status,
          price: subscription.items.data[0]?.price.id ?? "unknown",
          created: new Date(subscription.created * 1000).toISOString(),
        })));
      console.log(`Blocked account: ${match.email} ${JSON.stringify(active)}`);
    }
  }
  if (!apply) {
    console.log(blockers.length
      ? `Dry-run blocked: ${blockers.join("; ")}. No database or Stripe objects were changed.`
      : "Dry-run complete; no database or Stripe objects were changed. The scan is safe to apply.");
    return;
  }
  if (blockers.length) throw new Error(`Legacy Stripe import blocked: ${blockers.join("; ")}`);

  const customerColumn = mode === "live" ? "stripe_live_customer_id" : "stripe_test_customer_id";
  for (const { match, selection } of selections) {
    if (!selection.customerId) continue;
    const matchedCustomer = match.customers.find(({ customer }) => customer.id === selection.customerId);
    if (!matchedCustomer) throw new Error(`Selected Stripe customer is missing for ${match.email}`);
    const account = await ensureAccount(match);
    const { customer } = matchedCustomer;
    const { error: customerError } = await supabase
      .from("users")
      .update({ [customerColumn]: customer.id, updated_at: new Date().toISOString() })
      .eq("id", account.id);
    if (customerError) throw customerError;

    const firstMappedPurchase = Math.min(
      ...match.customers.flatMap(({ subscriptions }) => subscriptions.map(({ subscription }) => subscription.created)),
    );
    matchedCustomer.subscriptions.sort((a, b) => a.subscription.created - b.subscription.created);
    for (const { subscription, plan } of matchedCustomer.subscriptions) {
      const item = subscription.items.data[0];
      const starts = subscription.items.data.map((entry) => entry.current_period_start);
      const ends = subscription.items.data.map((entry) => entry.current_period_end);
      const createdAt = new Date(subscription.created * 1000);
      const { error: subscriptionError } = await supabase.from("student_subscriptions").upsert({
        user_id: account.id,
        provider: "stripe",
        plan_code: plan,
        stripe_customer_id: customer.id,
        stripe_subscription_id: subscription.id,
        stripe_product_id: stripeId(item?.price.product),
        stripe_price_id: item?.price.id ?? null,
        status: subscription.status,
        current_period_start: starts.length ? new Date(Math.min(...starts) * 1000).toISOString() : null,
        current_period_end: ends.length ? new Date(Math.max(...ends) * 1000).toISOString() : null,
        cancel_at: typeof subscription.cancel_at === "number"
          ? new Date(subscription.cancel_at * 1000).toISOString()
          : null,
        cancel_at_period_end: subscription.cancel_at_period_end,
        livemode: subscription.livemode,
        stripe_created_at: createdAt.toISOString(),
        refundable_until: subscription.created === firstMappedPurchase
          ? new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "stripe_subscription_id" });
      if (subscriptionError) throw subscriptionError;
    }
  }
  console.log(`Applied ${selections.length} Blueprint account reconciliation record(s).`);
}

async function ensureAccount(match: AccountMatch): Promise<Account> {
  if (match.account) return match.account;

  const { data: inserted, error: insertError } = await supabase
    .from("users")
    .insert({ email: match.email, plan: "free" })
    .select("id,email,plan,stripe_test_customer_id,stripe_live_customer_id")
    .maybeSingle<Account>();
  if (insertError && insertError.code !== "23505") throw insertError;
  if (inserted) {
    match.account = inserted;
    return inserted;
  }

  const { data: existing, error: existingError } = await supabase
    .from("users")
    .select("id,email,plan,stripe_test_customer_id,stripe_live_customer_id")
    .eq("email", match.email)
    .single<Account>();
  if (existingError || !existing) throw existingError ?? new Error(`Could not create ${match.email}`);
  match.account = existing;
  return existing;
}

async function planForSubscription(subscription: Stripe.Subscription): Promise<Plan | null> {
  const metadataPlan = subscription.metadata.plan_code?.toLowerCase();
  if (metadataPlan === "core" || metadataPlan === "max") return metadataPlan;
  const price = subscription.items.data[0]?.price;
  if (!price) return null;
  const configured = configuredPrices.get(price.id);
  if (configured) return configured;
  const pricePlan = price.metadata.plan_code?.toLowerCase();
  if (pricePlan === "core" || pricePlan === "max") return pricePlan;

  const productId = stripeId(price.product);
  if (!productId) return null;
  const configuredProductPlan = configuredProducts.get(productId);
  if (configuredProductPlan) return configuredProductPlan;
  if (productPlans.has(productId)) return productPlans.get(productId) ?? null;
  const product = await stripe.products.retrieve(productId);
  const productPlan = product.metadata.plan_code?.toLowerCase();
  const inferred = productPlan === "core" || productPlan === "max"
    ? productPlan
    : /\bmax\b/i.test(product.name)
      ? "max"
      : /\bcore\b/i.test(product.name)
        ? "core"
        : null;
  productPlans.set(productId, inferred);
  return inferred;
}

function option(name: string): string | null {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function importMode(value: string | null): "test" | "live" {
  if (value === "test" || value === "live") return value;
  console.error("Pass an explicit --mode=test or --mode=live");
  process.exit(1);
}

function stripeId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function configuredIds(value: string | undefined | null): string[] {
  return value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];
}

function hasLegacyBillingMarker(plan: string | null): boolean {
  const normalized = plan?.trim().toLowerCase();
  return Boolean(normalized && normalized !== "free");
}

function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Legacy Stripe import failed");
  process.exitCode = 1;
});
