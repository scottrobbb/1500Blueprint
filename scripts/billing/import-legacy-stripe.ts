/**
 * Reconcile legacy Stripe customers/subscriptions into the additive account model.
 * Dry-run is the default. Writes require both --apply and ALLOW_STRIPE_IMPORT_WRITE=true.
 *
 * npx tsx scripts/billing/import-legacy-stripe.ts --mode=live
 * npx tsx scripts/billing/import-legacy-stripe.ts --mode=live --core-price=price_... --max-price=price_... --apply
 */
import * as fs from "node:fs";
import * as path from "node:path";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

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
type Account = { id: string; email: string };

const args = process.argv.slice(2);
const mode = option("mode") === "test" ? "test" : "live";
const apply = args.includes("--apply");
const stripeKey = mode === "test"
  ? process.env.STRIPE_BILLING_KEY
  : process.env.STRIPE_RESTRICTED_KEY ?? process.env.STRIPE_LEGACY_KEY;
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const configuredPrices = new Map<string, Plan>([
  [option("core-price") ?? process.env.STRIPE_CORE_PRICE_ID ?? "", "core"],
  [option("max-price") ?? process.env.STRIPE_MAX_PRICE_ID ?? "", "max"],
].filter(([price]) => Boolean(price)) as [string, Plan][]);

if (!stripeKey || !supabaseUrl || !supabaseKey) {
  throw new Error("Stripe and Supabase service credentials are required");
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
    .select("id,email")
    .returns<Account[]>();
  if (error) throw error;
  const accountByEmail = new Map((accounts ?? []).map((account) => [account.email.toLowerCase(), account]));

  let customersScanned = 0;
  let customersMatched = 0;
  let customersWithMultipleMatches = 0;
  let subscriptionsMapped = 0;
  let subscriptionsUnknown = 0;
  const unknownPrices = new Set<string>();
  const customerByUser = new Map<string, Stripe.Customer>();

  for await (const customer of stripe.customers.list({ limit: 100 })) {
    customersScanned += 1;
    if (customer.deleted || !customer.email) continue;
    const account = accountByEmail.get(customer.email.trim().toLowerCase());
    if (!account) continue;
    customersMatched += 1;
    if (customerByUser.has(account.id)) customersWithMultipleMatches += 1;
    const chosen = customerByUser.get(account.id);
    if (!chosen || customer.created > chosen.created) customerByUser.set(account.id, customer);

    const mappedForUser: Array<{ subscription: Stripe.Subscription; plan: Plan }> = [];
    for await (const subscription of stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 100 })) {
      const plan = await planForSubscription(subscription);
      if (!plan) {
        subscriptionsUnknown += 1;
        const priceId = subscription.items.data[0]?.price.id;
        if (priceId) unknownPrices.add(priceId);
        continue;
      }
      subscriptionsMapped += 1;
      mappedForUser.push({ subscription, plan });
    }

    if (!apply) continue;
    const customerColumn = mode === "live" ? "stripe_live_customer_id" : "stripe_test_customer_id";
    const { error: customerError } = await supabase
      .from("users")
      .update({ [customerColumn]: customer.id, updated_at: new Date().toISOString() })
      .eq("id", account.id);
    if (customerError) throw customerError;

    mappedForUser.sort((a, b) => a.subscription.created - b.subscription.created);
    for (let index = 0; index < mappedForUser.length; index += 1) {
      const { subscription, plan } = mappedForUser[index];
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
        cancel_at_period_end: subscription.cancel_at_period_end,
        livemode: subscription.livemode,
        stripe_created_at: createdAt.toISOString(),
        refundable_until: index === 0
          ? new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "stripe_subscription_id" });
      if (subscriptionError) throw subscriptionError;
    }
  }

  console.log(`Mode: ${mode}; write mode: ${apply ? "APPLY" : "DRY RUN"}`);
  console.log(`Stripe customers scanned: ${customersScanned}`);
  console.log(`Blueprint accounts matched by verified email: ${customersMatched}`);
  console.log(`Accounts with multiple Stripe customer matches: ${customersWithMultipleMatches}`);
  console.log(`Subscriptions mapped to Core/Max: ${subscriptionsMapped}`);
  console.log(`Subscriptions requiring a price mapping: ${subscriptionsUnknown}`);
  if (unknownPrices.size) console.log(`Unknown price IDs: ${[...unknownPrices].sort().join(", ")}`);
  if (!apply) console.log("Dry-run complete; no database or Stripe objects were changed.");
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

function stripeId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Legacy Stripe import failed");
  process.exitCode = 1;
});
