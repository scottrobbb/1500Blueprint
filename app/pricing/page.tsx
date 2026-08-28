import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { isBillingCadence, type BillingCadence } from "@/lib/billing/offers";
import { vimeoEmbedUrl } from "@/lib/calls/vimeo";
import { EnrollButton } from "./EnrollButton";
import { ExamCountdown } from "./ExamCountdown";
import { FeatureGlyph, type FeatureIcon } from "./FeatureGlyph";
import { PlansPanel } from "./PlansPanel";
import { SavingsCalculator } from "./SavingsCalculator";
import { TestimonialReel } from "./TestimonialReel";
import { TestimonialWall } from "./TestimonialWall";
import styles from "./pricing.module.css";

const HERO_VSL_URL = "https://vimeo.com/1221856607?share=copy&fl=sv&fe=ci";
const TESTIMONIAL_REEL_URL = "https://vimeo.com/1221904969?share=copy&fl=sv&fe=ci";

const heroChecklist = [
  "4 Realistic Full-Length Practice Tests",
  "1250+ Question Bank Qs (with Desmos explanations)",
  "Step-by-step math and reading courses",
  "Weekly group class with Scott",
  "On-Demand Video Library, updated weekly",
  "Realistic challenge questions (built for 1400+ scorers)",
  "Targeted drills for grammar, reading, and vocab",
];

export const metadata: Metadata = {
  title: "Pricing | 1500 SAT Blueprint",
  description:
    "Compare Free, Core, and Max SAT prep plans, including practice tests, targeted drills, courses, weekly calls, and study planning.",
};

type PlanFeature = {
  label: string;
  icon: FeatureIcon;
};

const freeFeatures: PlanFeature[] = [
  { label: "300 questions", icon: "grid" },
  { label: "Desmos 101 course", icon: "book" },
  { label: "Reading & Writing 101 course", icon: "book" },
];

const coreFeatures: PlanFeature[] = [
  { label: "1250+ Questions (with Desmos explanations + challenge questions)", icon: "grid" },
  { label: "2 full-length adaptive digital SATs", icon: "file" },
  { label: "20 practice drills each day", icon: "bolt" },
  { label: "Everything in Free", icon: "check" },
];

const maxFeatures: PlanFeature[] = [
  { label: "1250+ Questions (with Desmos explanations + challenge questions)", icon: "grid" },
  { label: "4 full-length adaptive digital SATs", icon: "file" },
  { label: "Unlimited daily drills", icon: "bolt" },
  { label: "Access to all courses, quizzes, and flashcards", icon: "book" },
  { label: "Weekly group calls with Scott (recorded)", icon: "star" },
  { label: "Max Discord Role", icon: "chat" },
  { label: "Everything in Core", icon: "check" },
];

const insideColumns: Array<{
  icon: FeatureIcon;
  title: string;
  items: string[];
}> = [
  {
    icon: "book",
    title: "Learn & Master",
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
    icon: "target",
    title: "Practice & Improve",
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
    icon: "chart",
    title: "Test & Track",
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
      "Start with Free if you want to explore the platform. Choose Core if you're serious about improving and want consistent practice with more questions, drills, and tests. Go with Max if you want everything—including all courses, practice tests, challenge questions, drills, and weekly live calls with Scott.",
  },
  {
    question: "Are Core and Max billed monthly?",
    answer:
      "Yes. Core is available for $50/month, or $120 every 3 months — saving you $30 and bringing the effective price down to $40/month.\n\nMax is $80/month, billed monthly.\n\nBoth plans are cancel anytime, and you'll keep access through the end of your current billing period.",
  },
  {
    question: "Can I change plans later?",
    answer:
      "Yes. You can upgrade when you need more support or schedule a downgrade for your next renewal. Your practice history, scores, and course progress stay with your account.",
  },
  {
    question: "What is covered by the refund policy?",
    answer:
      "Your first purchase is covered by a 24-hour refund window. Contact support within that window if the plan is not the right fit.",
  },
  {
    question: "Do I need a card to start?",
    answer:
      "No. The Free plan does not require a card. You only enter payment details when you choose Core or Max.",
  },
  {
    question: "What happens on the weekly Max calls?",
    answer:
      "Each week, Scott hosts a live SAT strategy and problem-solving session covering topics like Math, Reading & Writing, Desmos, vocabulary, test strategy, and recent SAT questions. Calls are focused on breaking down difficult concepts, working through challenging problems, and showing you how to approach the SAT more effectively.\n\nCan't make it live? Every call is recorded, and Max members get access to the full library of past sessions.",
  },
  {
    question: "Will I lose progress if I cancel?",
    answer:
      "No. Your account keeps its course progress, attempts, scores, and study history. Paid features change with your plan, but the work you completed stays attached to your account.",
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
      "No. Each Blueprint membership is licensed for one student only and may not be shared, transferred, or used by multiple people.\n\nWe may monitor for unusual login or usage patterns that indicate account sharing. If an account is found to be shared, access may be restricted or suspended, and repeated or intentional violations may result in the account being terminated without a refund.",
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
  const billingEnabled = Boolean(
    process.env.STRIPE_BILLING_KEY
      && process.env.STRIPE_CORE_PRICE_ID
      && process.env.STRIPE_MAX_PRICE_ID,
  );
  const initialCadence: BillingCadence = (plan === "core" || plan === "max") && isBillingCadence(cadence)
    ? cadence
    : "monthly";

  return (
    <main className={styles.page}>
      <a href="#pricing-content" className={styles.skipLink}>Skip to pricing content</a>

      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="1500 SAT Blueprint home">
          <Logo withWordmark={false} className={styles.logoMark} />
          <span>1500 SAT Blueprint</span>
        </Link>
        <nav aria-label="Pricing navigation">
          <Link href="#inside">What you get</Link>
          <Link href="#stories">Student stories</Link>
          <Link href="#faq">FAQ</Link>
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
          initialCadence={initialCadence}
        />

        <p className={styles.planFootnote}>
          Core and Max are billed monthly or every three months.
          Both can be cancelled anytime, and your first purchase has a 24-hour refund window.
        </p>
      </section>

      <section className={styles.includedSection} id="inside">
        <div className={styles.insideHeading}>
          <h2>
            Max Includes <strong>Everything You Need to Reach 1500+</strong>
          </h2>
        </div>
        <div className={styles.insideGrid}>
          {insideColumns.map((column) => (
            <article className={styles.insideCard} key={column.title}>
              <div className={styles.insideCardIcon}>
                <FeatureGlyph name={column.icon} />
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
              <span>1500 SAT Blueprint</span>
            </Link>
            <p>Focused prep for the digital SAT.</p>
          </div>

          <nav className={styles.footerLinks} aria-label="Footer navigation">
            <div className={styles.footerColumn}>
              <h3>Explore</h3>
              <Link href="/">Home</Link>
              <Link href="#plans">Pricing</Link>
              <Link href="/practice-test">Practice tests</Link>
              <Link href="#stories">Student stories</Link>
            </div>
            <div className={styles.footerColumn}>
              <h3>Study tools</h3>
              <Link href="/ultimate/bank">Question Bank</Link>
              <Link href="/drills">Practice drills</Link>
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
              <Link href="#faq">FAQ</Link>
              <Link href="/community">Community</Link>
              <Link href="/ultimate/planner">Study planner</Link>
              <Link href="/ultimate/live-calls">Weekly calls</Link>
            </div>
          </nav>
        </div>

        <div className={styles.footerBottom}>
          <p>© 2026 1500 SAT Blueprint. All rights reserved.</p>
          <p>
            SAT is a registered trademark of College Board. 1500 SAT Blueprint
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
    invalid: "Choose Core or Max to continue.",
    upgraded: "Your upgrade is active. Stripe charged the prorated difference now.",
    downgrade: "Your downgrade is scheduled for your next renewal. Current access stays active until then.",
    "change-cancelled": "The scheduled plan change was removed. Your current plan will continue.",
    payment: "Stripe could not collect the prorated upgrade charge, so your current plan was not changed.",
    managed: "Your subscription is already on that plan.",
    ready: "You’re signed in. Your selected Core term is ready below.",
  };
  const message = messages[state] ?? "Billing could not be opened. Please try again.";
  return <div className={styles.billingNotice} role="status">{message}</div>;
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
