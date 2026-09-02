import { randomUUID } from "node:crypto";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import type { PlanCode } from "@/lib/auth/plans";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { isBillingCadence, type BillingCadence } from "@/lib/billing/offers";
import { billingCheckoutEnabled } from "@/lib/billing/config";
import { vimeoEmbedUrl } from "@/lib/calls/vimeo";
import { EnrollButton } from "./EnrollButton";
import { ExamCountdown } from "./ExamCountdown";
import { PlansPanel } from "./PlansPanel";
import { SavingsCalculator } from "./SavingsCalculator";
import { SmoothScrollLink } from "./SmoothScrollLink";
import { TestimonialReel } from "./TestimonialReel";
import { TestimonialWall } from "./TestimonialWall";
import {
  HERO_VSL_URL,
  TESTIMONIAL_REEL_URL,
  coreFeatures,
  freeFeatures,
  insideColumns,
  maxFeatures,
  type FaqItem,
} from "./landing-content";
import styles from "./pricing.module.css";

// The single-tier landing pages (/free, /max) share this shell so the design,
// the plan cards, and the checkout/signup paths stay the one implementation in
// app/pricing. The pricing page itself is untouched and keeps its own copy.
export type PricingLandingProps = {
  visiblePlans: readonly PlanCode[];
  heroChecklist: readonly string[];
  insideHeadingLead: string;
  insideHeadingHighlight: string;
  planFootnote: string;
  faq: readonly FaqItem[];
  // The savings calculator compares tutoring against the Max price, so it only
  // belongs on a page that is actually selling Max.
  showSavings: boolean;
  searchParams: { billing?: string; plan?: string; cadence?: string };
};

export async function PricingLanding({
  visiblePlans,
  heroChecklist,
  insideHeadingLead,
  insideHeadingHighlight,
  planFootnote,
  faq,
  showSavings,
  searchParams,
}: PricingLandingProps) {
  const session = await getSession();
  const access = session ? await getStudentAccess(session.email) : null;
  const { billing, plan, cadence } = searchParams;
  const billingEnabled = billingCheckoutEnabled();
  const initialCadence: BillingCadence = (plan === "core" || plan === "max") && isBillingCadence(cadence)
    ? cadence
    : "monthly";
  const checkoutTokens = { core: randomUUID(), max: randomUUID() };

  return (
    <main className={styles.page}>
      <a href="#pricing-content" className={styles.skipLink}>Skip to pricing content</a>

      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="1500 Blueprint home">
          <Logo withWordmark={false} className={styles.logoMark} />
          <span>1500 Blueprint</span>
        </Link>
        <nav aria-label="Pricing navigation">
          <SmoothScrollLink href="#inside">What you get</SmoothScrollLink>
          <SmoothScrollLink href="#stories">Student stories</SmoothScrollLink>
          <SmoothScrollLink href="#faq">FAQ</SmoothScrollLink>
        </nav>
        <Link href="/account/login?next=/ultimate" className={styles.openApp}>
          Log in <ArrowIcon />
        </Link>
      </header>

      <section className={styles.hero} id="pricing-content">
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <h1>1500 Blueprint.<br />Crush the SAT.</h1>
            <ul className={styles.heroChecklist}>
              {heroChecklist.map((item) => (
                <li key={item}>
                  <PlanCheckIcon />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className={styles.heroActions}>
              <EnrollButton className={styles.heroPrimary}>
                Enroll Now
              </EnrollButton>
            </div>
          </div>

          <div className={styles.heroVisual}>
            <VslCard />
          </div>
        </div>
      </section>

      <section className={styles.planSection} id="plans">
        {billing ? <BillingNotice state={billing} /> : null}

        {/* A hidden tier's features would still be serialized into the RSC
            payload, so a single-tier page would ship the other tiers' copy in
            its page source. Only the visible tier's list is passed. */}
        <PlansPanel
          freeFeatures={visiblePlans.includes("free") ? freeFeatures : []}
          coreFeatures={visiblePlans.includes("core") ? coreFeatures : []}
          maxFeatures={visiblePlans.includes("max") ? maxFeatures : []}
          currentPlan={access?.plan ?? null}
          billingEnabled={billingEnabled}
          initialCadence={initialCadence}
          checkoutTokens={checkoutTokens}
          visiblePlans={visiblePlans}
        />

        <p className={styles.planFootnote}>{planFootnote}</p>
      </section>

      <section className={styles.includedSection} id="inside">
        <div className={styles.insideHeading}>
          <h2>
            {insideHeadingLead}{" "}
            <span className={styles.insideHeadingHighlight}>{insideHeadingHighlight}</span>
          </h2>
        </div>
        <div className={styles.insideGrid}>
          {insideColumns.map((column) => (
            <article className={styles.insideCard} key={column.title}>
              <div className={styles.insideCardArt}>
                <Image src={column.art} alt="" width={200} height={200} />
              </div>
              <h3>{column.title}</h3>
              <ul>
                {column.items.map((item) => (
                  <li key={item}>
                    <PlanCheckIcon />
                    <span>{renderWithBold(item)}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {showSavings ? (
        <section className={styles.savingsSection}>
          <SavingsCalculator />
        </section>
      ) : null}

      <section className={styles.videoSection} id="stories">
        <div className={styles.storyHeading}>
          <SectionHeading
            title="Hear from students who used the Blueprint."
            description="Students share what helped them prepare, improve, and feel ready for test day."
            dark
          />
        </div>
        <TestimonialReel url={TESTIMONIAL_REEL_URL} />
      </section>

      <section className={styles.writtenStoriesSection}>
        <div className={styles.writtenStoriesIntro}>
          <h2>More from students</h2>
        </div>
        <TestimonialWall />
      </section>

      <section className={styles.faqSection} id="faq">
        <div className={styles.faqLayout}>
          <div className={styles.faqIntro}>
            <h2>Frequently Asked Questions</h2>
            <Image src="/images/blu-questioning.png" alt="" width={220} height={198} className={styles.faqArt} />
          </div>
          <div className={styles.faqList}>
            {faq.map((item, index) => (
              <details key={item.question} open={index === 0}>
                <summary>
                  <span>{item.question}</span>
                  <i aria-hidden="true" />
                </summary>
                {item.answer.split("\n\n").map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.bottomCta}>
        <EnrollButton className={styles.bottomCtaButton}>
          Enroll Now
        </EnrollButton>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerMain}>
          <div className={styles.footerIdentity}>
            <Link href="/" className={styles.footerBrand}>
              <Logo withWordmark={false} className={styles.logoMark} />
              <span>1500 Blueprint</span>
            </Link>
            <p>Focused prep for the digital SAT.</p>
          </div>

          <nav className={styles.footerLinks} aria-label="Footer navigation">
            <div className={styles.footerColumn}>
              <h3>Explore</h3>
              <Link href="/">Home</Link>
              <SmoothScrollLink href="#plans">Pricing</SmoothScrollLink>
              <Link href="/practice-test">Practice tests</Link>
              <SmoothScrollLink href="#stories">Student stories</SmoothScrollLink>
            </div>
            <div className={styles.footerColumn}>
              <h3>Study tools</h3>
              <Link href="/ultimate/bank">Question Bank</Link>
              <Link href="/ultimate/drills">Practice drills</Link>
              <Link href="/ultimate/courses">Courses</Link>
              <Link href="/flashcards">Flashcards</Link>
            </div>
            <div className={styles.footerColumn}>
              <h3>Account</h3>
              <Link href="/account/sign-up">Create account</Link>
              <Link href="/account/login?next=/ultimate">Log in</Link>
              <Link href="/ultimate">Open app</Link>
              <Link href="/history">Progress history</Link>
            </div>
            <div className={styles.footerColumn}>
              <h3>More</h3>
              <SmoothScrollLink href="#faq">FAQ</SmoothScrollLink>
              <Link href="/community">Community</Link>
              <Link href="/ultimate/planner">Study planner</Link>
              <Link href="/ultimate/live-calls">Weekly calls</Link>
            </div>
          </nav>
        </div>

        <div className={styles.footerBottom}>
          <div className={styles.footerLegal}>
            <p>© 2026 1500 Blueprint. All rights reserved.</p>
            <a href="https://docs.google.com/document/d/e/2PACX-1vTDMGNb4tNBjeakIccr0ArqPDmo9Mbgy82VeDpyhCuE9ck3I1sYvxBvOHDNZq2qeCJ3n9w4Ci6qgUGe/pub" target="_blank" rel="noopener noreferrer">
              Terms of Service
            </a>
            <a href="https://docs.google.com/document/d/e/2PACX-1vQ86GanKtOzKMzzOvBV84B0zi3u5DrlLEQpgsL1qIBw4kykz9XoIs7o3O82bCJzpT6YnB9UMCEvqFUc/pub" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            <a href="https://docs.google.com/document/d/e/2PACX-1vRGrlSejcxyiU4gfKFTRa0YVq_LyJuGFn7jDCYp3v339U4d-_FezfjDNGujVUhw3YZWHciGWIC-oVA8/pub" target="_blank" rel="noopener noreferrer">
              Refund &amp; Cancellation Policy
            </a>
            <a href="https://docs.google.com/document/d/e/2PACX-1vS7LxJuIaWzEAyJ5b75vqhZ5yQ8d2-cMewm4boddfHfT8PxIbveUZ-Jlwu47RZArskjeRVvA2eOgD0x/pub" target="_blank" rel="noopener noreferrer">
              Cookie Policy
            </a>
          </div>
          <p>
            SAT is a registered trademark of College Board. 1500 Blueprint
            is not affiliated with or endorsed by College Board.
          </p>
        </div>
      </footer>
    </main>
  );
}

function VslCard() {
  const base = vimeoEmbedUrl(HERO_VSL_URL);
  const embedUrl = base ? `${base}${base.includes("?") ? "&" : "?"}autoplay=1&muted=1&loop=1&title=0&byline=0&portrait=0` : null;

  return (
    <div className={styles.vslCard}>
      <div className={styles.vslFrame}>
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title="1500 Blueprint overview"
            allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-fullscreen"
          />
        ) : null}
      </div>
      <ExamCountdown />
    </div>
  );
}

function SectionHeading({
  title,
  description,
  dark = false,
}: {
  title: string;
  description?: string;
  dark?: boolean;
}) {
  return (
    <div className={`${styles.sectionHeading} ${dark ? styles.sectionHeadingDark : ""}`}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

function BillingNotice({ state }: { state: string }) {
  const messages: Record<string, string> = {
    cancelled: "Checkout was cancelled. Nothing was charged.",
    account: "This account cannot start a subscription.",
    invalid: "Choose a plan to continue.",
    upgraded: "Your upgrade is active. Stripe charged the prorated difference now.",
    downgrade: "Your downgrade is scheduled for your next renewal. Current access stays active until then.",
    "change-cancelled": "The scheduled plan change was removed. Your current plan will continue.",
    payment: "Stripe could not collect the prorated upgrade charge, so your current plan was not changed.",
    managed: "Your subscription is already on that plan.",
    ready: "You’re signed in. Your selected paid plan is ready below.",
    unavailable: "Billing is not open yet. Nothing was charged.",
    "checkout-active": "A different Checkout session is still open. Return to it or cancel it before choosing another plan.",
    legacy: "We found existing Blueprint billing history that must be linked before changing plans. Nothing was charged.",
  };
  const message = messages[state] ?? "Billing could not be opened. Please try again.";
  return (
    <div className={styles.billingNotice} role="status">
      {message}
      {state === "checkout-active" ? (
        <form action="/api/billing/checkout/cancel-current" method="post" className={styles.billingNoticeAction}>
          <button type="submit" className={styles.billingNoticeButton}>Cancel it</button>
        </form>
      ) : null}
    </div>
  );
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5" /></svg>;
}

function PlanCheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}

function renderWithBold(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, index) =>
    index % 2 === 1 ? <strong key={index}>{part}</strong> : part,
  );
}
