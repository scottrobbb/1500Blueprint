import Stripe from "stripe";
import { ACTIVE_STATUSES } from "./config";
import { legacyFallbackPlan, planForLegacyProductId, planForPriceId } from "@/lib/billing/config";
import { reportServerError } from "@/lib/observability/server";
import type { StoredPlan } from "./plans";

// Lazily created so an empty key never throws at import/build time.
let client: Stripe | null = null;
function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_RESTRICTED_KEY;
    if (!key) throw new Error("STRIPE_RESTRICTED_KEY is not configured");
    client = new Stripe(key);
  }
  return client;
}

// plan is a StoredPlan, never a Stripe display value -- see StoredPlan in
// ./plans for why this type is closed.
export type Membership = { active: boolean; plan: StoredPlan | null };

type MembershipCustomer = {
  id: string;
  email: string | null;
};

type MembershipSubscription = {
  status: string;
  items: { data: Array<{ price: { id: string; nickname: string | null; product: string | null } }> };
};

export type MembershipDependencies = {
  listCustomers: (options: {
    email?: string;
    limit: number;
    startingAfter?: string;
  }) => Promise<{ data: MembershipCustomer[]; hasMore: boolean }>;
  listSubscriptions: (customerId: string) => Promise<MembershipSubscription[]>;
};

// Is this email an active paying student? Finds the customer(s) by email, then
// looks for any subscription in an active/trialing status. Read-only — works
// with a restricted key scoped to Customers:read + Subscriptions:read.
export async function getMembership(
  email: string,
  dependencies: MembershipDependencies = stripeDependencies(),
): Promise<Membership> {
  const lookup = email.trim().toLowerCase();
  if (!lookup) return { active: false, plan: null };

  const exact = await dependencies.listCustomers({ email: lookup, limit: 100 });
  const customers = exact.data.length > 0
    ? exact.data
    : await findCustomersIgnoringEmailCase(lookup, dependencies);
  if (customers.length === 0) return { active: false, plan: null };

  // A MEMBERSHIP_REQUIRE_ACTIVE_SUB=false escape hatch used to sit here and let
  // any existing Stripe customer through as plan "testing" -- which resolves to
  // Max, and which record_login then wrote to users.plan permanently. Stripe
  // creates a customer for an abandoned or declined Checkout too, so it handed
  // full access to people whose payment never succeeded. Gone deliberately: the
  // only way past this gate is an active subscription.
  for (const customer of customers) {
    const subscriptions = await dependencies.listSubscriptions(customer.id);
    const active = subscriptions.find((s) =>
      (ACTIVE_STATUSES as readonly string[]).includes(s.status),
    );
    if (active) {
      return { active: true, plan: planForSubscription(active, lookup) };
    }
  }
  return { active: false, plan: null };
}

// Stripe data becomes a plan code exactly here, at the boundary where it enters
// the system, rather than being stored raw and guessed at on the way out.
function planForSubscription(subscription: MembershipSubscription, email: string): StoredPlan {
  const price = subscription.items.data[0]?.price;
  if (!price) return reportUnresolvedPlan(email, "no price on subscription");

  const configured = planForPriceId(price.id);
  if (configured) return configured;

  const legacy = price.product ? planForLegacyProductId(price.product) : null;
  if (legacy) return legacy;

  // A nickname that names its tier outright is still trustworthy; one that does
  // not must never be stored, which is what produced the original defect.
  const nickname = price.nickname?.trim().toLowerCase() ?? "";
  if (nickname.includes("max")) return "max";
  if (nickname.includes("core")) return "core";

  return reportUnresolvedPlan(email, `price ${price.id}${price.product ? ` (product ${price.product})` : ""}`);
}

function reportUnresolvedPlan(email: string, detail: string): StoredPlan {
  const fallback = legacyFallbackPlan();
  reportServerError(
    "auth.membership.plan_unresolved",
    new Error(`Active subscription for ${email} could not be mapped to a plan: ${detail}. Granted ${fallback}.`),
    { provider: "stripe", source: "getMembership", reason: detail },
  );
  return fallback;
}

async function findCustomersIgnoringEmailCase(
  email: string,
  dependencies: MembershipDependencies,
): Promise<MembershipCustomer[]> {
  const matches: MembershipCustomer[] = [];
  let startingAfter: string | undefined;

  for (let page = 1; page <= 100; page += 1) {
    const result = await dependencies.listCustomers({
      limit: 100,
      startingAfter,
    });
    matches.push(...result.data.filter((customer) => customer.email?.trim().toLowerCase() === email));

    if (!result.hasMore || result.data.length === 0) return matches;
    startingAfter = result.data.at(-1)?.id;
  }

  throw new Error("Stripe customer search exceeded the supported page limit");
}

function stripeDependencies(): MembershipDependencies {
  return {
    listCustomers: async ({ email, limit, startingAfter }) => {
      const result = await stripe().customers.list({
        email,
        limit,
        starting_after: startingAfter,
      });
      return {
        data: result.data.map((customer) => ({ id: customer.id, email: customer.email })),
        hasMore: result.has_more,
      };
    },
    listSubscriptions: async (customerId) => {
      const result = await stripe().subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      });
      return result.data.map((subscription) => ({
        status: subscription.status,
        items: {
          data: subscription.items.data.map((item) => ({
            price: {
              id: item.price.id,
              nickname: item.price.nickname,
              // Unexpanded, so this is the product id string -- exactly what
              // planForLegacyProductId matches against.
              product: typeof item.price.product === "string" ? item.price.product : item.price.product?.id ?? null,
            },
          })),
        },
      }));
    },
  };
}
