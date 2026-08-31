/**
 * Reconcile paid Stripe subscriptions from a Dashboard subscription export.
 *
 * Dry-run (default):
 *   npx tsx --env-file=.env.local scripts/billing/reconcile-stripe-export.ts \
 *     --file=/path/to/subscriptions.csv
 *
 * Apply only after reviewing the dry run:
 *   ALLOW_STRIPE_IMPORT_WRITE=true npx tsx --env-file=.env.local \
 *     scripts/billing/reconcile-stripe-export.ts --file=/path/to/subscriptions.csv --apply
 *
 * The script never changes Stripe. It creates missing Blueprint accounts and
 * backfills only paid-status subscriptions that are not already represented by
 * a paid live student_subscriptions row. Untracked duplicate paid subscriptions,
 * account status conflicts, customer ownership conflicts, and unmapped products
 * block the entire write before any row is changed. Duplicate Stripe groups that
 * already have one tracked paid row are reported and left untouched.
 */
import * as fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

type Plan = "core" | "max";
type UserRow = {
  id: string;
  email: string;
  account_status: "active" | "suspended" | "archived";
  stripe_live_customer_id: string | null;
};
type SubscriptionRow = {
  user_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: string;
  livemode: boolean;
};
type StripeExportRow = {
  id: string;
  customerId: string;
  email: string;
  priceId: string;
  productId: string;
  productName: string;
  status: string;
  plan: Plan;
  createdAt: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};
type Repair = { account: UserRow | null; subscription: StripeExportRow };

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const includeEmails = args.includes("--include-emails");
const file = option("file");
const paidStatuses = new Set(["active", "trialing", "past_due"]);
const legacyMaxProducts = new Set(configuredIds(process.env.STRIPE_LEGACY_MAX_PRODUCT_IDS));
const legacyCoreProducts = new Set(configuredIds(process.env.STRIPE_LEGACY_CORE_PRODUCT_IDS));

if (!file || !fs.existsSync(file)) throw new Error("Pass an existing Stripe export with --file=/path/subscriptions.csv");
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
}
if (apply && process.env.ALLOW_STRIPE_IMPORT_WRITE !== "true") {
  throw new Error("Set ALLOW_STRIPE_IMPORT_WRITE=true together with --apply to authorize writes");
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

async function main(): Promise<void> {
  const exported = parseStripeExport(fs.readFileSync(file!, "utf8"));
  const paid = exported.filter((row) => paidStatuses.has(row.status));
  const paidByEmail = groupBy(paid, (row) => row.email);

  const [{ data: users, error: usersError }, { data: subscriptions, error: subscriptionsError }] =
    await Promise.all([
      db.from("users")
        .select("id,email,account_status,stripe_live_customer_id")
        .limit(1000)
        .returns<UserRow[]>(),
      db.from("student_subscriptions")
        .select("user_id,stripe_subscription_id,stripe_customer_id,status,livemode")
        .eq("livemode", true)
        .limit(1000)
        .returns<SubscriptionRow[]>(),
    ]);
  if (usersError) throw new Error(`Could not load Blueprint accounts: ${usersError.message}`);
  if (subscriptionsError) {
    throw new Error(`Could not load Blueprint subscriptions: ${subscriptionsError.message}`);
  }

  const usersByEmail = new Map((users ?? []).map((user) => [normalizeEmail(user.email), user]));
  const subscriptionsByUser = groupBy(subscriptions ?? [], (row) => row.user_id);
  const subscriptionsById = new Map(
    (subscriptions ?? []).map((row) => [row.stripe_subscription_id, row]),
  );
  const repairs: Repair[] = [];
  const blockers: string[] = [];
  let alreadyTracked = 0;
  let duplicatePaidGroupsSkipped = 0;

  for (const [email, stripeSubscriptions] of paidByEmail) {
    const account = usersByEmail.get(email) ?? null;
    const trackedPaid = account
      ? (subscriptionsByUser.get(account.id) ?? []).filter((row) => paidStatuses.has(row.status))
      : [];
    if (trackedPaid.length > 0) {
      if (stripeSubscriptions.length > 1) duplicatePaidGroupsSkipped += 1;
      alreadyTracked += 1;
      continue;
    }
    if (stripeSubscriptions.length !== 1) {
      blockers.push(`paid subscription count is ${stripeSubscriptions.length} for one email`);
      continue;
    }

    const subscription = stripeSubscriptions[0];
    if (account?.account_status && account.account_status !== "active") {
      blockers.push(`a paid subscription belongs to a ${account.account_status} account`);
      continue;
    }
    if (
      account?.stripe_live_customer_id
      && account.stripe_live_customer_id !== subscription.customerId
    ) {
      blockers.push("a paid subscription customer conflicts with its Blueprint account");
      continue;
    }
    const existingSubscription = subscriptionsById.get(subscription.id);
    if (
      existingSubscription
      && (
        !account
        || existingSubscription.user_id !== account.id
        || existingSubscription.stripe_customer_id !== subscription.customerId
        || !existingSubscription.livemode
      )
    ) {
      blockers.push("a Stripe subscription is already owned by a different identity");
      continue;
    }
    repairs.push({ account, subscription });
  }

  const uniqueBlockers = [...new Set(blockers)];
  const accountsToCreate = repairs.filter((repair) => repair.account === null).length;
  console.log(`Stripe export rows: ${exported.length}`);
  console.log(`Paid-status subscription rows: ${paid.length}`);
  console.log(`Paid unique emails: ${paidByEmail.size}`);
  console.log(`Already tracked paid accounts: ${alreadyTracked}`);
  console.log(`Tracked duplicate-paid Stripe groups skipped: ${duplicatePaidGroupsSkipped}`);
  console.log(`Paid accounts to repair: ${repairs.length}`);
  console.log(`Blueprint accounts to create: ${accountsToCreate}`);
  console.log(`Preflight blocker categories: ${uniqueBlockers.length}`);
  uniqueBlockers.forEach((blocker) => console.log(`  BLOCKED: ${blocker}`));
  if (includeEmails) repairs.forEach((repair) => console.log(`  REPAIR: ${repair.subscription.email}`));

  if (!apply) {
    console.log("[dry-run] Nothing was written.");
    return;
  }
  if (uniqueBlockers.length) {
    throw new Error("Stripe export reconciliation is blocked; no rows were changed");
  }

  let repaired = 0;
  for (const repair of repairs) {
    const account = repair.account ?? await ensureAccount(repair.subscription.email);
    await linkCustomer(account, repair.subscription.customerId);
    await storeSubscription(account, repair.subscription, exported);
    repaired += 1;
  }
  console.log(`Repaired ${repaired} paid Blueprint account(s).`);
}

async function ensureAccount(email: string): Promise<UserRow> {
  const { data, error } = await db.from("users")
    .insert({ email, plan: "free" })
    .select("id,email,account_status,stripe_live_customer_id")
    .single<UserRow>();
  if (error) throw new Error(`Could not create a missing paid account: ${error.message}`);
  return data;
}

async function linkCustomer(account: UserRow, customerId: string): Promise<void> {
  const { error } = await db.from("users")
    .update({ stripe_live_customer_id: customerId, updated_at: new Date().toISOString() })
    .eq("id", account.id)
    .or(`stripe_live_customer_id.is.null,stripe_live_customer_id.eq.${customerId}`);
  if (error) throw new Error(`Could not link a paid account to Stripe: ${error.message}`);
}

async function storeSubscription(
  account: UserRow,
  subscription: StripeExportRow,
  exported: StripeExportRow[],
): Promise<void> {
  const firstPurchase = exported
    .filter((row) => row.email === subscription.email)
    .map((row) => Date.parse(row.createdAt))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)[0];
  const refundableUntil = firstPurchase === Date.parse(subscription.createdAt)
    ? new Date(firstPurchase + 24 * 60 * 60 * 1000).toISOString()
    : null;
  const { error } = await db.from("student_subscriptions").upsert({
    user_id: account.id,
    provider: "stripe",
    plan_code: subscription.plan,
    stripe_customer_id: subscription.customerId,
    stripe_subscription_id: subscription.id,
    stripe_product_id: subscription.productId,
    stripe_price_id: subscription.priceId,
    status: subscription.status,
    current_period_start: subscription.currentPeriodStart,
    current_period_end: subscription.currentPeriodEnd,
    cancel_at: null,
    cancel_at_period_end: subscription.cancelAtPeriodEnd,
    livemode: true,
    stripe_created_at: subscription.createdAt,
    refundable_until: refundableUntil,
    updated_at: new Date().toISOString(),
  }, { onConflict: "stripe_subscription_id" });
  if (error) throw new Error(`Could not store a paid Stripe subscription: ${error.message}`);
}

function parseStripeExport(input: string): StripeExportRow[] {
  const records = recordsFromCsv(input);
  const required = [
    "id", "Customer ID", "Customer Email", "Plan", "Product", "Product ID",
    "Status", "Created (UTC)", "Current Period Start (UTC)", "Current Period End (UTC)",
  ];
  if (records.length === 0 || required.some((header) => !(header in records[0]))) {
    throw new Error("The Stripe subscription export is missing required columns");
  }
  return records.map((record) => {
    const email = normalizeEmail(record["Customer Email"]);
    const plan = exportedPlan(record);
    const id = record.id?.trim();
    const customerId = record["Customer ID"]?.trim();
    const priceId = record.Plan?.trim();
    const productId = record["Product ID"]?.trim();
    const createdAt = exportedTimestamp(record["Created (UTC)"]);
    if (!email || !id || !customerId || !priceId || !productId || !plan || !createdAt) {
      throw new Error("A Stripe subscription export row has an invalid identity or plan mapping");
    }
    return {
      id,
      customerId,
      email,
      priceId,
      productId,
      productName: record.Product?.trim() ?? "",
      status: record.Status?.trim().toLowerCase() ?? "",
      plan,
      createdAt,
      currentPeriodStart: exportedTimestamp(record["Current Period Start (UTC)"]),
      currentPeriodEnd: exportedTimestamp(record["Current Period End (UTC)"]),
      cancelAtPeriodEnd: record["Cancel At Period End"]?.trim().toLowerCase() === "true",
    };
  });
}

function exportedPlan(record: Record<string, string>): Plan | null {
  const metadataPlan = record["plan_code (metadata)"]?.trim().toLowerCase();
  if (metadataPlan === "core" || metadataPlan === "max") return metadataPlan;
  const productId = record["Product ID"]?.trim();
  if (legacyCoreProducts.has(productId)) return "core";
  if (legacyMaxProducts.has(productId)) return "max";
  const productName = record.Product?.trim() ?? "";
  if (/\bcore\b/i.test(productName)) return "core";
  if (/\b(?:max|starter)\b/i.test(productName)) return "max";
  return null;
}

function exportedTimestamp(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const timestamp = Date.parse(`${trimmed.replace(" ", "T")}Z`);
  if (!Number.isFinite(timestamp)) throw new Error("A Stripe export timestamp is invalid");
  return new Date(timestamp).toISOString();
}

function recordsFromCsv(input: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  const headers = rows[0]?.map((value) => value.replace(/^\uFEFF/, ""));
  if (!headers) return [];
  return rows.slice(1).map((fields) =>
    Object.fromEntries(headers.map((header, index) => [header, fields[index] ?? ""])),
  );
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }
  return grouped;
}

function normalizeEmail(value: string | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function configuredIds(value: string | undefined): string[] {
  return value?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
}

function option(name: string): string | null {
  const prefix = `--${name}=`;
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? null;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Stripe export reconciliation failed");
  process.exitCode = 1;
});
