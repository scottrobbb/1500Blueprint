/**
 * Reconcile legacy users.plan values against Stripe.
 *
 * users.plan is written only at magic-link login, when Stripe confirmed an
 * active subscription. Nothing clears it when that subscription lapses, and
 * effectivePlan falls through to it for any member with no student_subscriptions
 * rows -- so a stale value grants access indefinitely. This asks Stripe for each
 * member's current status and rewrites the row to match.
 *
 * Review first (default -- reads only, writes nothing):
 *   npx tsx --env-file=.env.local scripts/reconcile-legacy-plans.ts
 *
 * Apply after reading the report:
 *   npx tsx --env-file=.env.local scripts/reconcile-legacy-plans.ts --write
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, and STRIPE_RESTRICTED_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { getMembership } from "../lib/auth/stripe";
import { resolveStoredPlan } from "../lib/auth/stored-plan";

type UserRow = { id: string; email: string; plan: string | null };
type Outcome = {
  email: string;
  storedPlan: string | null;
  grantedToday: string;
  stripeSays: string;
  action: "clear" | "rewrite" | "keep";
  nextPlan: string | null;
};

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

async function page<T>(
  run: (from: number, to: number) => PromiseLike<PageResult<T>>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await run(offset, offset + 999);
    if (error) throw new Error(`Could not read ${label}: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
}

async function main() {
  const write = process.argv.includes("--write");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecret) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  }
  if (!process.env.STRIPE_RESTRICTED_KEY) {
    throw new Error("STRIPE_RESTRICTED_KEY is required to read subscription status.");
  }
  const db = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

  // Only members whose access actually comes from users.plan: effectivePlan
  // prefers a grant or a subscription whenever either exists, so anyone holding
  // one is already governed by a live source and must not be touched here.
  const [users, grantedIds, subscribedIds] = await Promise.all([
    page<UserRow>((from, to) => db.from("users").select("id,email,plan")
      .eq("account_status", "active").not("plan", "is", null).range(from, to), "users"),
    page<{ user_id: string }>((from, to) => db.from("access_grants").select("user_id")
      .is("revoked_at", null).range(from, to), "access_grants"),
    page<{ user_id: string }>((from, to) => db.from("student_subscriptions").select("user_id")
      .range(from, to), "student_subscriptions"),
  ]);

  const excluded = new Set([
    ...grantedIds.map((row) => row.user_id),
    ...subscribedIds.map((row) => row.user_id),
  ]);
  const legacyMembers = users.filter((user) => (
    !excluded.has(user.id) && resolveStoredPlan(user.plan) !== "free"
  ));

  console.log(`${users.length} active accounts, ${legacyMembers.length} getting paid access from users.plan alone.\n`);

  const outcomes: Outcome[] = [];
  for (const [index, user] of legacyMembers.entries()) {
    if (index > 0 && index % 25 === 0) console.log(`  …checked ${index}/${legacyMembers.length}`);
    let membership;
    try {
      membership = await getMembership(user.email);
    } catch (error) {
      console.error(`  SKIPPED ${user.email}: Stripe lookup failed (${error instanceof Error ? error.message : error})`);
      continue;
    }

    const grantedToday = resolveStoredPlan(user.plan);
    if (!membership.active) {
      outcomes.push({ email: user.email, storedPlan: user.plan, grantedToday, stripeSays: "no active subscription", action: "clear", nextPlan: null });
      continue;
    }
    const nextPlan = membership.plan;
    outcomes.push({
      email: user.email,
      storedPlan: user.plan,
      grantedToday,
      stripeSays: `active (${nextPlan})`,
      action: nextPlan === user.plan ? "keep" : "rewrite",
      nextPlan,
    });
  }

  const clears = outcomes.filter((o) => o.action === "clear");
  const rewrites = outcomes.filter((o) => o.action === "rewrite");
  console.log(`\n${clears.length} to lose access (no active subscription):`);
  for (const o of clears) console.log(`  ${o.email}  ${JSON.stringify(o.storedPlan)} -> null  (had ${o.grantedToday})`);
  console.log(`\n${rewrites.length} to be rewritten to a real plan code:`);
  for (const o of rewrites) console.log(`  ${o.email}  ${JSON.stringify(o.storedPlan)} -> ${o.nextPlan}  (${o.stripeSays})`);
  console.log(`\n${outcomes.filter((o) => o.action === "keep").length} already correct.`);

  if (!write) {
    console.log("\n[dry-run] Nothing was written. Re-run with --write to apply.");
    return;
  }

  let written = 0;
  for (const outcome of [...clears, ...rewrites]) {
    const { error } = await db.from("users").update({ plan: outcome.nextPlan }).eq("email", outcome.email);
    if (error) {
      console.error(`  failed ${outcome.email}: ${error.message}`);
      continue;
    }
    written++;
  }
  console.log(`\nUpdated ${written} of ${clears.length + rewrites.length} accounts.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
