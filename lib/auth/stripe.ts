import Stripe from "stripe";
import { ACTIVE_STATUSES } from "./config";

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

export type Membership = { active: boolean; plan: string | null };

type MembershipCustomer = {
  id: string;
  email: string | null;
};

type MembershipSubscription = {
  status: string;
  items: { data: Array<{ price: { id: string; nickname: string | null } }> };
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

  // TEMPORARY (testing only): when MEMBERSHIP_REQUIRE_ACTIVE_SUB=false, any existing
  // Stripe customer counts as a member — no subscription required. Remove that env
  // var to restore the active-subscription gate before real students use this.
  if (process.env.MEMBERSHIP_REQUIRE_ACTIVE_SUB === "false") {
    return { active: true, plan: "testing" };
  }

  for (const customer of customers) {
    const subscriptions = await dependencies.listSubscriptions(customer.id);
    const active = subscriptions.find((s) =>
      (ACTIVE_STATUSES as readonly string[]).includes(s.status),
    );
    if (active) {
      const price = active.items.data[0]?.price;
      return { active: true, plan: price?.nickname ?? price?.id ?? null };
    }
  }
  return { active: false, plan: null };
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
            },
          })),
        },
      }));
    },
  };
}
