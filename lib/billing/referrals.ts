// Rewardful affiliate attribution.
//
// Rewardful reads the referral from the Stripe *customer's* metadata and pays
// the affiliate whenever that customer is charged. It does not go on the
// Checkout Session's client_reference_id, which Rewardful's default Stripe
// instructions reach for: that field already carries the Blueprint account id,
// and /api/billing/confirm rejects a session whose value does not match it, so
// borrowing it would fail every referred purchase after taking the money.

// Rewardful referral ids are UUIDs. The value arrives from a hidden input their
// script writes into the checkout form, which makes it browser-supplied like
// any other field -- so it is validated before it can reach Stripe.
const REFERRAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function rewardfulReferral(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return REFERRAL_UUID.test(trimmed) ? trimmed : null;
}

// What to write onto the customer, or null when there is nothing to do.
//
// The first affiliate to refer a customer keeps them: an existing referral is
// never overwritten, so a later visit through someone else's link cannot poach
// a relationship that already earned its commission.
export function referralMetadataUpdate(
  existing: Record<string, string> | null | undefined,
  referral: string | null,
): { referral: string } | null {
  if (!referral) return null;
  if (existing?.referral) return null;
  return { referral };
}
