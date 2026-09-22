import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { isCheckoutTerm, type CheckoutTerm } from "@/lib/billing/offers";
import { billingCheckoutEnabled, weekPassCheckoutEnabled } from "@/lib/billing/config";
import { vimeoEmbedUrl } from "@/lib/calls/vimeo";
import { EnrollButton } from "./EnrollButton";
import { ExamCountdown } from "./ExamCountdown";
import type { FeatureIcon } from "./FeatureGlyph";
import { PlansPanel } from "./PlansPanel";
import { SavingsCalculator } from "./SavingsCalculator";
import { SmoothScrollLink } from "./SmoothScrollLink";
import { TestimonialReel } from "./TestimonialReel";
import { TestimonialWall } from "./TestimonialWall";
import styles from "./pricing.module.css";

const HERO_VSL_URL = "https://vimeo.com/1221856607?share=copy&fl=sv&fe=ci";
const TESTIMONIAL_REEL_URL = "https://vimeo.com/1221904969?share=copy&fl=sv&fe=ci";

const heroChecklist = [
  "6 Realistic Full-Length Practice Tests",
  "2100+ Question Bank Qs (with Desmos explanations)",
  "Step-by-step math and reading courses",
  "Weekly group class with Scott",
  "On-Demand Video Library, updated weekly",
  "Realistic challenge questions (built for 1400+ scorers)",
  "Targeted drills for grammar, reading, and vocab",
];

export const metadata: Metadata = {
  title: "Pricing | 1500 Blueprint",
  description:
    "Compare Free, Core, and Max SAT prep plans, including practice tests, targeted drills, courses, weekly calls, and study planning.",
  alternates: { canonical: "/pricing" },
};

type PlanFeature = {
  label: string;
  icon: FeatureIcon;
};

const freeFeatures: PlanFeature[] = [
  { label: "200 questions (20 Challenge Questions)", icon: "grid" },
  { label: "1 full-length adaptive digital SAT", icon: "file" },
  { label: "Desmos 101 course", icon: "book" },
  { label: "Reading & Writing 101 course", icon: "book" },
];

const coreFeatures: PlanFeature[] = [
  { label: "2100+ Questions (with Desmos explanations + challenge questions)", icon: "grid" },
  { label: "2 full-length adaptive digital SATs", icon: "file" },
  { label: "20 practice drills each day", icon: "bolt" },
  { label: "Everything in Free", icon: "check" },
];

const maxFeatures: PlanFeature[] = [
  { label: "2100+ Questions (with Desmos explanations + challenge questions)", icon: "grid" },
  { label: "6 full-length adaptive digital SATs", icon: "file" },
  { label: "Unlimited daily drills", icon: "bolt" },
  { label: "Access to all courses, quizzes, and flashcards", icon: "book" },
  { label: "Weekly group calls with Scott (recorded)", icon: "star" },
  { label: "Max Discord Role", icon: "chat" },
  { label: "Everything in Core", icon: "check" },
];

const insideColumns: Array<{
  title: string;
  art: string;
  items: string[];
}> = [
  {
    title: "Learn & Master",
    art: "/images/blu-learn.png",
    items: [
      "Learn every tested concept with step-by-step courses",
      "Master Math, Reading, Writing, Grammar, and Desmos",
      "Follow a clear path instead of guessing what to study",
      "Get explanations, strategies, and shortcuts built for the SAT",
      "Join the private Blueprint Discord community",
      "Get support, accountability, and weekly live group calls with Scott",
    ],
  },
  {
    title: "Practice & Improve",
    art: "/images/blu-practice.png",
    items: [
      "Practice with a realistic SAT Question Bank (Zero AI Questions)",
      "Drill questions by topic, difficulty, and skill",
      "Take quizzes built directly into each course",
      "Challenge yourself with my hardest **Challenge Questions**",
      "Review detailed explanations for every question",
      "Turn weak areas into targeted practice",
    ],
  },
  {
    title: "Test & Track",
    art: "/images/blu-track.png",
    items: [
      "Take realistic, full-length digital SAT practice tests",
      "Practice under real SAT timing and conditions",
      "Get detailed score and section breakdowns",
      "Identify exactly where you're losing points",
      "Review mistakes and target weaknesses before your next test",
      "Track your progress as your score improves",
    ],
  },
];

const faqItems = [
  {
    question: "Which plan should I choose?",
    answer:
      "Start with Free if you just want to explore the platform. Core gives you more practice with additional questions, drills, and tests.\n\nBlueprint Max is the best choice if you're serious about maximizing your score. It unlocks the full platform, including all courses, practice tests, challenge questions, unlimited drills, and weekly live calls with Scott. If you want the complete Blueprint experience and the most structured path to a 1500+, choose Max.",
  },
  {
    question: "What makes Blueprint Max different from other SAT prep programs?",
    answer:
      "A lot of SAT prep is still built around outdated strategies from the paper SAT.\n\nBlueprint Max is built specifically for the modern Digital SAT, with a major focus on mastering Desmos and using it to solve questions faster, easier, and more consistently.\n\nYou also get structured courses, difficult practice tests, Challenge-level questions, and weekly live calls with me — the kind of ongoing coaching access that can easily cost $1,000+ through traditional SAT tutoring programs.\n\nBlueprint Max isn't just another question bank. It's a complete system built around how the SAT is actually taken today.",
  },
  {
    question: "How are Core and Max billed?",
    answer:
      "Core is available for $50/month, or $120 every 3 months — saving you $30 and bringing the effective price down to $40/month.\n\nMax is available for $80/month, or $210 every 3 months — saving you $30 and bringing the effective price down to $70/month.\n\nBoth plans can be cancelled anytime, and you'll keep access through the end of your current billing period.\n\nBoth options are paid upfront for the billing period you choose and automatically renew until canceled. The $39 one-week Max pass is a one-time payment with no subscription or automatic renewal. There are no installment payments or additional subscription fees.",
  },
  {
    question: "Can I change plans later?",
    answer:
      "Yes. You can upgrade when you need more support or schedule a downgrade for your next renewal. Your practice history, scores, and course progress stay with your account.",
  },
  {
    question: "Can I get a refund for my subscription?",
    answer:
      "Your first subscription purchase is eligible for a full refund within 24 hours of purchase. After that 24-hour window, the purchase is non-refundable.\n\nAll subscription renewals are final and non-refundable. To make sure a renewal doesn't catch you by surprise, we'll send you a reminder email before your subscription renews. You can cancel anytime before your renewal date to prevent the next charge.\n\nTo cancel, head to Settings → Subscription.",
  },
  {
    question: "Does Blueprint Max cover both Math and Reading & Writing?",
    answer:
      "Yes. Blueprint Max covers both SAT Math and Reading & Writing.\n\nFor Math, you'll learn the core concepts you need for the SAT, along with a heavy focus on Desmos strategies, shortcuts, and efficient problem-solving methods. For Reading & Writing, Blueprint Max covers grammar, reading comprehension, vocabulary, transitions, rhetorical synthesis, inference, command of evidence, and more.\n\nYou'll also get access to targeted drills, practice questions, full-length practice tests, and structured courses designed to help you improve across the entire SAT — not just one section.",
  },
  {
    question: "What happens on the weekly Max calls?",
    answer:
      "Each week, Scott hosts a live SAT strategy and problem-solving session covering topics like Math, Reading & Writing, Desmos, vocabulary, test strategy, and recent SAT questions. Calls are focused on breaking down difficult concepts, working through challenging problems, and showing you how to approach the SAT more effectively.\n\nCan't make it live? Every call is recorded, and Max members get access to the full library of past sessions.",
  },
  {
    question: "What happens if I cancel my subscription?",
    answer:
      "When you cancel, you'll keep access to your current plan through the end of your paid billing period. You won't be charged again after that. Your progress, scores, and study history will remain saved to your account if you decide to come back later.",
  },
  {
    question: "What's included in the Free plan?",
    answer:
      "The Free plan gives you access to a selection of Blueprint lessons, practice resources, and platform features so you can start preparing without paying. Upgrade to Core or Max anytime for access to more practice, tests, and premium features.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit and debit cards. Your available payment options will be shown securely at checkout.",
  },
  {
    question: "Can I share my account with someone else?",
    answer:
      "No. Each Blueprint membership is for one student and can't be shared or transferred. Accounts found to be intentionally shared may be restricted or suspended.",
  },
  {
    question: "Are there any additional fees or charges?",
    answer:
      "No. There are no hidden fees or surprise charges. You'll only be charged the price of the plan you choose, plus any applicable taxes.",
  },
] as const;

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string; plan?: string; cadence?: string }>;
}) {
  const session = await getSession();
  const access = session ? await getStudentAccess(session.email) : null;
  const { billing, plan, cadence } = await searchParams;
  const billingEnabled = billingCheckoutEnabled();
  const initialCadence: CheckoutTerm = (plan === "core" || plan === "max") && isCheckoutTerm(cadence)
    ? cadence
    : "monthly";
  const checkoutTokens = { core: randomUUID(), max: randomUUID() };

  return (
    // The landing pages carry their own self-contained palette, so they stay on
    // the light token set regardless of the visitor's dark-mode choice.
    <main data-theme="light" className={styles.page}>
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

        <PlansPanel
          freeFeatures={freeFeatures}
          coreFeatures={coreFeatures}
          maxFeatures={maxFeatures}
          currentPlan={access?.plan ?? null}
          billingEnabled={billingEnabled}
          weekPassEnabled={weekPassCheckoutEnabled()}
          initialCadence={initialCadence}
          checkoutTokens={checkoutTokens}
        />

        <p className={styles.planFootnote}>
          The one-week Max pass is $39 once and ends after 7 days. Monthly and three-month plans renew until canceled.
          Subscriptions can be canceled anytime. Your first purchase has a 24-hour refund window, and renewals are non-refundable.
        </p>
      </section>

      <section className={styles.includedSection} id="inside">
        <div className={styles.insideHeading}>
          <h2>
            Max Includes Everything You Need to Reach{" "}
            <span className={styles.insideHeadingHighlight}>1500+</span>
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

      <section className={styles.savingsSection}>
        <SavingsCalculator />
      </section>

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
            {faqItems.map((item, index) => (
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
            <a
              href="https://docs.google.com/document/d/e/2PACX-1vTDMGNb4tNBjeakIccr0ArqPDmo9Mbgy82VeDpyhCuE9ck3I1sYvxBvOHDNZq2qeCJ3n9w4Ci6qgUGe/pub"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms of Service
            </a>
            <a
              href="https://docs.google.com/document/d/e/2PACX-1vQ86GanKtOzKMzzOvBV84B0zi3u5DrlLEQpgsL1qIBw4kykz9XoIs7o3O82bCJzpT6YnB9UMCEvqFUc/pub"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </a>
            <a
              href="https://docs.google.com/document/d/e/2PACX-1vRGrlSejcxyiU4gfKFTRa0YVq_LyJuGFn7jDCYp3v339U4d-_FezfjDNGujVUhw3YZWHciGWIC-oVA8/pub"
              target="_blank"
              rel="noopener noreferrer"
            >
              Refund & Cancellation Policy
            </a>
            <a
              href="https://docs.google.com/document/d/e/2PACX-1vS7LxJuIaWzEAyJ5b75vqhZ5yQ8d2-cMewm4boddfHfT8PxIbveUZ-Jlwu47RZArskjeRVvA2eOgD0x/pub"
              target="_blank"
              rel="noopener noreferrer"
            >
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
    pending: "Your payment is processing. Your seven days of Max access will start once payment is confirmed.",
    cancelled: "Checkout was cancelled. Nothing was charged.",
    account: "This account cannot start a subscription.",
    invalid: "Choose Core or Max to continue.",
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
