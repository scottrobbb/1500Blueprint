import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { billingCheckoutEnabled, isBillablePlan } from "@/lib/billing/config";
import { isBillingCadence } from "@/lib/billing/offers";
import { CheckoutRedirect } from "./CheckoutRedirect";

export const metadata = { title: "Checkout | 1500 Blueprint" };

// Carries a paid plan across signing up or logging in. The pricing CTA posts
// straight to /api/billing/checkout; only when that finds no session does it
// send the student here, and the path is preserved through login, account
// creation, and email verification by the existing `next` handling.
//
// This route is intentionally absent from the proxy's PUBLIC_PATHS: an
// anonymous visit is redirected to /account/login?next=/checkout?... and
// returns here afterwards, which is what preserves the purchase intent.
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; cadence?: string }>;
}) {
  const { plan, cadence: requestedCadence } = await searchParams;

  // Only the internal plan codes are accepted. The Stripe price is resolved
  // server-side in the checkout route from this code, never from the URL, so a
  // hand-edited parameter cannot select an arbitrary price.
  if (!isBillablePlan(plan)) redirect("/pricing?billing=invalid");
  const cadence = isBillingCadence(requestedCadence) ? requestedCadence : "monthly";
  if (!billingCheckoutEnabled()) redirect("/pricing?billing=unavailable");

  // The proxy already gates this path; this is the same check at the route, in
  // the shape the rest of the app uses.
  const session = await getSession();
  if (!session) {
    redirect(`/account/login?next=${encodeURIComponent(`/checkout?plan=${plan}&cadence=${cadence}`)}`);
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-ice px-4">
      <CheckoutRedirect plan={plan} cadence={cadence} checkoutToken={randomUUID()} />
    </main>
  );
}
