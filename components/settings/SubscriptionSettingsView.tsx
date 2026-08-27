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
    <div className="space-y-9">
      {billingState === "error" ? (
        <div role="alert" className="rounded-xl border border-danger/15 bg-danger-bg px-4 py-3 text-sm font-semibold text-danger-600">
          Stripe billing could not be opened. Please try again or contact support.
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-[0_20px_55px_-42px_rgba(11,42,91,0.65)]">
        <div className="relative overflow-hidden bg-[linear-gradient(125deg,#07193b,#0b2a5b_55%,#174b91)] px-5 py-6 text-white sm:px-7 sm:py-7">
          <div aria-hidden className="absolute -right-16 -top-24 h-64 w-64 rounded-full border-[42px] border-sky/[0.06]" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-display text-[28px] font-extrabold tracking-[-0.035em]">
                {planName(access.plan)}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/62">
                {accessSourceDescription(data)}
              </p>
              {access.source === "grant" && grant?.expiresAt ? (
                <p className="mt-2 text-xs font-semibold text-sky/85">
                  Complimentary access ends {formatDate(grant.expiresAt)}.
                </p>
              ) : null}
              {data.grantUnavailable && access.source === "grant" ? (
                <p className="mt-2 text-xs font-semibold text-gold">
                  Grant expiration details are temporarily unavailable.
                </p>
              ) : null}
            </div>
            <Link
              href="/pricing#plans"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-white/18 bg-white/[0.07] px-4 text-sm font-extrabold text-white transition-colors hover:bg-white/[0.13]"
            >
              {access.plan === "free" ? "View plans" : "Compare plans"}
            </Link>
          </div>
        </div>

        <div className="p-5 sm:p-7">
          {subscription ? (
            <h3 className="font-display text-lg font-extrabold text-navy">
              {planName(subscription.plan)}
            </h3>
          ) : (
            <h3 className="font-display text-lg font-extrabold text-navy">
              No active paid subscription
            </h3>
          )}

          {data.subscriptionUnavailable ? (
            <div className="mt-4 rounded-xl border border-flag/20 bg-flag-bg px-4 py-3 text-sm text-navy/65">
              Billing lifecycle details are temporarily unavailable. Your access has not been changed.
            </div>
          ) : subscription ? (
            <BillingLifecycle subscription={subscription} />
          ) : (
            <p className="mt-2 text-sm leading-6 text-navy/50">
              {access.source === "grant" || access.source === "legacy"
                ? "Your current access is not billed through this account."
                : "Choose Core or Max whenever you are ready for more practice and support."}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {account?.hasStripeCustomer ? (
              <form action="/api/billing/portal" method="post">
                <input type="hidden" name="returnTo" value="/settings/subscription" />
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-extrabold text-white shadow-[0_2px_0_#2b8fe0] transition-colors hover:bg-brand-600"
                >
                  Manage billing
                </button>
              </form>
            ) : null}
            {subscription || access.plan !== "max" ? (
              <Link
                href="/pricing#plans"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-navy/15 bg-white px-5 text-sm font-extrabold text-navy transition-colors hover:border-brand/35 hover:text-brand-600"
              >
                {subscription ? "Change plan" : "See upgrade options"}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section aria-labelledby="allowances-heading">
        <SectionHeading
          id="allowances-heading"
          title="Plan allowances"
        />
        <div className="grid gap-3 md:grid-cols-3">
          {planView.usage.map((metric) => (
            <article key={metric.key} className="rounded-2xl border border-navy/10 bg-white p-5 shadow-[0_16px_40px_-36px_rgba(11,42,91,0.5)]">
              <div className="flex items-start justify-between gap-3">
                <span className={`grid h-9 w-9 place-items-center rounded-xl ${metric.included ? "bg-ice text-brand-600" : "bg-haze text-navy/32"}`}>
                  <UsageIcon name={metric.key} className="h-[18px] w-[18px]" />
                </span>
              </div>
              <h3 className="mt-4 text-sm font-extrabold text-navy">{metric.title}</h3>
              <p className={`mt-1 text-sm font-bold ${metric.unavailable ? "text-flag" : metric.included ? "text-brand-600" : "text-navy/38"}`}>
                {metric.valueLabel}
              </p>
              {metric.percentage !== null ? (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-navy/[0.07]" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#3fa9f5,#1d8fe4)]"
                    style={{ width: `${metric.percentage}%` }}
                  />
                </div>
              ) : null}
              <p className="mt-3 text-xs leading-5 text-navy/42">
                {metric.description}
                {!metric.included && metric.unlockPlan
                  ? ` Available with ${planName(metric.unlockPlan)}.`
                  : null}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="features-heading">
        <SectionHeading
          id="features-heading"
          title="Plan features"
        />
        <div className="overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-[0_18px_45px_-40px_rgba(11,42,91,0.55)]">
          <div className="grid lg:grid-cols-[180px_minmax(0,1fr)]">
            <aside className="border-b border-navy/8 bg-ice/45 p-5 sm:p-6 lg:border-b-0 lg:border-r">
              <span className="grid h-12 w-12 place-items-center rounded-xl border border-brand/10 bg-white text-brand-600 shadow-sm">
                <FeatureSummaryIcon className="h-6 w-6" />
              </span>
              <p className="mt-5 font-display text-3xl font-extrabold tracking-[-0.04em] text-navy">
                {planView.features.filter((feature) => feature.included).length}/{planView.features.length}
              </p>
              <p className="mt-1 text-sm font-semibold text-navy/48">features included</p>
            </aside>

            <ul className="min-w-0">
              {planView.features.map((feature, index) => (
                <li
                  key={feature.key}
                  className={`flex items-center gap-4 px-4 py-4 sm:px-5 ${index > 0 ? "border-t border-navy/8" : ""}`}
                >
                  <span className={`grid h-10 w-10 flex-none place-items-center rounded-xl ${featureTone(feature.key, feature.included)}`}>
                    <PlanFeatureIcon name={feature.key} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className={`text-sm font-extrabold ${feature.included ? "text-navy" : "text-navy/48"}`}>
                      {feature.title}
                    </h3>
                    {feature.valueLabel ? (
                      <p className="mt-0.5 text-xs font-bold text-brand-600">{feature.valueLabel}</p>
                    ) : null}
                    <p className="mt-0.5 text-xs leading-5 text-navy/42">
                      {feature.description}
                      {!feature.included && feature.unlockPlan
                        ? ` Available with ${planName(feature.unlockPlan)}.`
                        : null}
                    </p>
                  </div>
                  <span
                    className={`grid h-7 w-7 flex-none place-items-center rounded-full ${feature.included ? "bg-success-bg text-success-600" : "bg-haze text-navy/28"}`}
                    aria-label={feature.included ? "Included" : "Locked"}
                    title={feature.included ? "Included" : "Locked"}
                  >
                    {feature.included ? <CheckIcon className="h-4 w-4" /> : <LockIcon className="h-3.5 w-3.5" />}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function BillingLifecycle({ subscription }: { subscription: NonNullable<SubscriptionSettingsData["subscription"]> }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <LifecycleItem
        label={subscription.cancelAtPeriodEnd ? "Access ends" : subscription.status === "trialing" ? "Trial ends" : "Next renewal"}
        value={subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : "Not available"}
      />
      {subscription.pendingPlan ? (
        <LifecycleItem
          label="Scheduled change"
          value={`${planName(subscription.pendingPlan)}${subscription.pendingChangeEffectiveAt ? ` on ${formatDate(subscription.pendingChangeEffectiveAt)}` : ""}`}
          warning
        />
      ) : (
        <LifecycleItem
          label="Plan status"
          value={subscription.cancelAtPeriodEnd ? "Cancellation scheduled" : statusLabel(subscription.status)}
          warning={subscription.cancelAtPeriodEnd || subscription.status === "past_due"}
        />
      )}
    </div>
  );
}

function LifecycleItem({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${warning ? "border-flag/20 bg-flag-bg" : "border-navy/8 bg-haze/60"}`}>
      <p className={`text-sm ${warning ? "text-flag" : "text-navy"}`}>
        <span className="font-semibold">{label}:</span>{" "}
        <span className="font-extrabold">{value}</span>
      </p>
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

function accessSourceDescription(data: SubscriptionSettingsData): string {
  if (!data.access.active) return "This account is suspended. Contact support if you believe this is a mistake.";
  if (data.access.isTestAccount) return "This production-safe test persona uses simulated plan access and is not billed.";
  if (data.access.source === "grant") {
    const reason = data.grant?.reason?.trim();
    return reason ? `Complimentary access: ${reason}` : "Complimentary access granted to this student account.";
  }
  if (data.access.source === "legacy") return "Legacy member access carried forward from your original Blueprint account.";
  if (data.access.source === "subscription") return "Access provided by your active personal subscription.";
  return "Start with the Blueprint fundamentals, then upgrade whenever you need more practice or support.";
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

function FeatureSummaryIcon({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 13 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 7h6" strokeLinecap="round" /></svg>;
}

function PlanFeatureIcon({ name, className }: { name: SettingsPlanView["features"][number]["key"]; className?: string }) {
  if (name === "desmos101") {
    return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M7 7h10M8 12h1M12 12h1M16 12h1M8 16h1M12 16h1M16 16h1" strokeLinecap="round" /></svg>;
  }
  if (name === "readingWriting101") {
    return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23Z" /><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23Z" /></svg>;
  }
  if (name === "challengeQuestions") {
    return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="m15 9 5-5M17 4h3v3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (name === "allCourses") {
    return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5Z" strokeLinejoin="round" /><path d="m5 11-2 1 9 5 9-5-2-1M5 15l-2 1 9 5 9-5-2-1" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (name === "studyPlanner") {
    return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3 10h18M8 14h3M8 17h6" strokeLinecap="round" /></svg>;
  }
  if (name === "liveGroupClasses") {
    return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="14" height="14" rx="2.5" /><path d="m17 10 4-2v8l-4-2ZM8 9l5 3-5 3Z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 18.5c-2.5 0-4.5-1.7-4.5-4s2-4 4.5-4h10c2.5 0 4.5 1.7 4.5 4s-2 4-4.5 4" /><circle cx="9" cy="14.5" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="14.5" r="1" fill="currentColor" stroke="none" /><path d="M8 10.5 6.5 7M16 10.5 17.5 7" strokeLinecap="round" /></svg>;
}

function featureTone(name: SettingsPlanView["features"][number]["key"], included: boolean): string {
  if (!included) return "bg-haze text-navy/28";
  const tones: Record<SettingsPlanView["features"][number]["key"], string> = {
    desmos101: "bg-ice text-brand-600",
    readingWriting101: "bg-[#f0edff] text-[#795be8]",
    challengeQuestions: "bg-[#fff0df] text-[#c97819]",
    allCourses: "bg-success-bg text-success-600",
    studyPlanner: "bg-[#eaf0ff] text-[#4b70d8]",
    liveGroupClasses: "bg-[#ffebef] text-[#c94d69]",
    discordRole: "bg-[#edf3ff] text-[#5865f2]",
  };
  return tones[name];
}

function UsageIcon({ name, className }: { name: SettingsPlanView["usage"][number]["key"]; className?: string }) {
  if (name === "questionBankLimit") {
    return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>;
  }
  if (name === "fullTestLimit") {
    return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 3h7l4 4v14H7Z" /><path d="M14 3v5h5M10 13h5M10 17h5" /></svg>;
  }
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m13 2-7 11h5l-1 9 8-12h-5Z" strokeLinejoin="round" /></svg>;
}
