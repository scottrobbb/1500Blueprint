/**
 * Deletes a student account on their behalf, through the same
 * deleteStudentAccount() the self-service "Delete account" button uses:
 * cancels paid Stripe subscriptions, erases their rows, anonymizes the user
 * row, and removes the sign-in.
 *
 * Without --delete it only shows what it found. Needs the real
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and STRIPE_BILLING_KEY.
 *
 * NODE_OPTIONS=--conditions=react-server npx tsx scripts/account/delete-student.ts student@example.com
 * NODE_OPTIONS=--conditions=react-server npx tsx scripts/account/delete-student.ts student@example.com --delete
 */
import { deleteStudentAccount } from "../../lib/account/deletion";
import { supabaseAdmin } from "../../utils/supabase/admin";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Pass the student's email as the first argument.");

  const db = supabaseAdmin();
  const { data: user, error } = await db
    .from("users")
    .select("id,email,name,plan,account_status,created_at")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  if (!user) {
    console.log(`No account found for ${email}.`);
    return;
  }
  const { data: subscriptions } = await db
    .from("student_subscriptions")
    .select("stripe_subscription_id,status")
    .eq("user_id", user.id);
  console.log("Account:", user);
  console.log("Subscriptions:", subscriptions ?? []);

  if (!process.argv.includes("--delete")) {
    console.log("\nDry run. Re-run with --delete to delete this account.");
    return;
  }
  console.log("\nDeleting:", await deleteStudentAccount(email));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
