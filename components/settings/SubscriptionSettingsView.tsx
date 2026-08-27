import Link from "next/link";
import type { PlanCode } from "@/lib/auth/plans";
import type { SettingsPlanView } from "@/lib/settings/plan-view";
import type { SubscriptionSettingsData } from "@/lib/settings/data";

export function SubscriptionSettingsView({
  data,
  planView,
  billingState,
}: {
  data: SubscriptionSettingsData;
  planView: SettingsPlanView;
  billingState?: string;
}) {
  const { access, account, grant, subscription } = data;

  return (
    <div className="space-y-12">
      {billingState === "error" ? (
        <div role="alert" className="rounded-xl border border-danger/15 bg-danger-bg px-4 py-3 text-sm font-semibold text-danger-600">
          Stripe billing could not be opened. Please try again or contact support.
        </div>
      ) : null}

      <section aria-labelledby="current-plan-heading">
        <SectionHeading id="current-plan-heading" title="Current plan" />
        <div className="overflow-hidden rounded-2xl border-2 border-navy/10 bg-white">
          <div className="flex items-center justify-between gap-5 px-5 py-5 sm:px-6">
            <h3 className="font-display text-xl font-extrabold text-navy">
              {planName(access.plan)}
            </h3>
            <span className={`text-sm font-bold ${access.active ? "text-success-600" : "text-danger-600"}`}>
              {access.active ? "Active" : "Suspended"}
            </span>
          </div>

          <dl className="divide-y-2 divide-navy/[0.07] border-t-2 border-navy/[0.07]">
            <PlanDetail label="Access" value={accessSourceLabel(data)} />
            <PlanDetail
              label="Billing"
              value={data.subscriptionUnavailable ? "Temporarily unavailable" : subscription ? "Managed through Stripe" : "Not billed"}
              warning={data.subscriptionUnavailable}
            />
            {subscription ? (
              <PlanDetail
                label="Plan status"
                value={subscription.cancelAtPeriodEnd ? "Cancellation scheduled" : statusLabel(subscription.status)}
                warning={subscription.cancelAtPeriodEnd || subscription.status === "past_due"}
              />
            ) : null}
            {subscription?.currentPeriodEnd ? (
              <PlanDetail
                label={subscription.cancelAtPeriodEnd ? "Access ends" : subscription.status === "trialing" ? "Trial ends" : "Next renewal"}
                value={formatDate(subscription.currentPeriodEnd)}
              />
            ) : null}
            {subscription?.pendingPlan ? (
              <PlanDetail
                label="Scheduled change"
                value={`${planName(subscription.pendingPlan)}${subscription.pendingChangeEffectiveAt ? ` on ${formatDate(subscription.pendingChangeEffectiveAt)}` : ""}`}
                warning
              />
            ) : null}
            {access.source === "grant" && grant?.expiresAt ? (
              <PlanDetail label="Access ends" value={formatDate(grant.expiresAt)} />
            ) : null}
            {data.grantUnavailable && access.source === "grant" ? (
              <PlanDetail label="Access ends" value="Temporarily unavailable" warning />
            ) : null}
          </dl>

          {account?.hasStripeCustomer || access.plan !== "max" ? (
            <div className="flex flex-wrap gap-2 border-t-2 border-navy/[0.07] bg-haze/45 px-5 py-4 sm:px-6">
              {account?.hasStripeCustomer ? (
                <form action="/api/billing/portal" method="post">
                  <input type="hidden" name="returnTo" value="/settings/subscription" />
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-navy px-4 text-sm font-bold text-white transition-colors hover:bg-navy-700"
                  >
                    Manage billing
                  </button>
                </form>
              ) : null}
              {access.plan !== "max" ? (
                <Link
                  href="/pricing#plans"
                  className="inline-flex h-10 items-center justify-center rounded-lg border-2 border-navy/10 bg-white px-4 text-sm font-bold text-navy transition-colors hover:border-brand/30 hover:text-brand-600"
                >
                  {subscription ? "Change plan" : "Upgrade plan"}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="allowances-heading">
        <SectionHeading
          id="allowances-heading"
          title="Plan allowances"
        />
        <div className="divide-y-2 divide-navy/[0.07] overflow-hidden rounded-2xl border-2 border-navy/10 bg-white">
          {planView.usage.map((metric) => (
            <div key={metric.key} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
              <h3 className="text-sm font-bold text-navy">{metric.title}</h3>
              <p className={`text-sm font-bold sm:text-right ${metric.unavailable ? "text-flag" : metric.included ? "text-navy" : "text-navy/38"}`}>
                {metric.valueLabel}
                {!metric.included && metric.unlockPlan
                  ? ` · ${planName(metric.unlockPlan)}`
                  : null}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="features-heading">
        <SectionHeading
          id="features-heading"
          title="Plan features"
        />
        <ul className="divide-y-2 divide-navy/[0.07] overflow-hidden rounded-2xl border-2 border-navy/10 bg-white">
          {planView.features.map((feature) => (
            <li key={feature.key} className="flex items-center justify-between gap-5 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h3 className={`text-sm font-bold ${feature.included ? "text-navy" : "text-navy/45"}`}>
                  {feature.title}
                </h3>
                {feature.valueLabel ? (
                  <p className="mt-0.5 text-xs font-semibold text-navy/45">{feature.valueLabel}</p>
                ) : null}
              </div>
              <span className={`flex flex-none items-center gap-2 text-xs font-bold ${feature.included ? "text-success-600" : "text-navy/38"}`}>
                {feature.included ? <CheckIcon className="h-4 w-4" /> : <LockIcon className="h-3.5 w-3.5" />}
                {feature.included ? "Included" : feature.unlockPlan ? planName(feature.unlockPlan) : "Locked"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function PlanDetail({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-5 px-5 py-4 sm:px-6">
      <dt className="text-sm font-semibold text-navy/50">{label}</dt>
      <dd className={`text-right text-sm font-bold ${warning ? "text-flag" : "text-navy"}`}>{value}</dd>
    </div>
  );
}

function SectionHeading({ id, title }: { id: string; title: string }) {
  return (
    <div className="mb-4">
      <h2 id={id} className="font-display text-xl font-extrabold tracking-[-0.025em] text-navy">{title}</h2>
    </div>
  );
}

function accessSourceLabel(data: SubscriptionSettingsData): string {
  if (data.access.isTestAccount) return "Test account";
  if (data.access.source === "grant") return "Complimentary access";
  if (data.access.source === "legacy") return "Legacy membership";
  if (data.access.source === "subscription") return "Personal subscription";
  return "Free plan";
}

function statusLabel(status: string): string {
  if (status === "active") return "Active";
  if (status === "trialing") return "Free trial";
  if (status === "past_due") return "Payment due";
  return status.replaceAll("_", " ");
}

function planName(plan: PlanCode): string {
  if (plan === "max") return "1500 Blueprint Max";
  if (plan === "core") return "1500 Blueprint Core";
  return "1500 Blueprint Free";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

type IconProps = { className?: string };

function CheckIcon({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function LockIcon({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
}
