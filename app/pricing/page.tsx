import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { isBillingCadence, type BillingCadence } from "@/lib/billing/offers";
import { vimeoEmbedUrl } from "@/lib/calls/vimeo";
import { ExamCountdown } from "./ExamCountdown";
import { PlansPanel } from "./PlansPanel";
import styles from "./pricing.module.css";
import { TestimonialVideos } from "./TestimonialVideos";

const HERO_VSL_URL = "https://vimeo.com/1221856607?share=copy&fl=sv&fe=ci";

const heroChecklist = [
  "4 1:1 Realistic Full-Length Practice Tests",
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
    "Compare Hobby, Core, and Max SAT prep plans, including practice tests, targeted drills, courses, weekly calls, and study planning.",
};

type FeatureIcon =
  | "target"
  | "grid"
  | "chat"
  | "bolt"
  | "file"
  | "calendar"
  | "play"
  | "star"
  | "check"
  | "chart"
  | "book";

type PlanFeature = {
  label: string;
  icon: FeatureIcon;
};

const freeFeatures: PlanFeature[] = [
  { label: "300 questions", icon: "grid" },
  { label: "Desmos 101 course", icon: "bolt" },
  { label: "Reading & Writing 101 course", icon: "book" },
];

const coreFeatures: PlanFeature[] = [
  { label: "1250+ Questions (with Desmos Explanations)", icon: "grid" },
  { label: "2 full-length digital SATs", icon: "file" },
  { label: "20 practice drills each day", icon: "bolt" },
  { label: "Desmos 101 course", icon: "bolt" },
  { label: "Reading & Writing 101 course", icon: "book" },
  { label: "Challenge questions", icon: "target" },
];

const maxFeatures: PlanFeature[] = [
  { label: "Everything in Core", icon: "check" },
  { label: "4 full-length digital SATs", icon: "file" },
  { label: "Unlimited daily drills", icon: "bolt" },
  { label: "All 3 courses and 41 lessons", icon: "play" },
  { label: "Personal study planner", icon: "calendar" },
  { label: "Weekly calls with Scott and recordings", icon: "star" },
];

const productFeatures: Array<{
  icon: FeatureIcon;
  title: string;
  description: string;
}> = [
  {
    icon: "grid",
    title: "Question Banks",
    description: "Math and Reading & Writing practice on every plan",
  },
  {
    icon: "file",
    title: "Full-length digital SATs",
    description: "1 on Hobby, 2 on Core, 4 on Max",
  },
  {
    icon: "bolt",
    title: "Daily practice drills",
    description: "20 a day on Core, unlimited on Max",
  },
  {
    icon: "book",
    title: "Courses and lessons",
    description: "Foundation for everyone, all 41 lessons on Max",
  },
  {
    icon: "calendar",
    title: "Personal study planner",
    description: "Max only, built around your test date and score goal",
  },
  {
    icon: "star",
    title: "Weekly calls and recordings",
    description: "Max only, live with Scott plus recordings",
  },
];

const videoStories = [
  {
    name: "Annie",
    src: "/testimonials/annie.mp4",
    poster: "/testimonials/annie-poster.jpg",
    quote: "I was able to get my score from a 1220 to a 1350 in a little over two months.",
  },
  {
    name: "Felix",
    src: "/testimonials/felix.mp4",
    poster: "/testimonials/felix-poster.jpg",
    quote: "I went from a 1190 to a 1480 on the May SAT, all thanks to the Blueprint.",
  },
  {
    name: "Michael",
    src: "/testimonials/michael.mp4",
    poster: "/testimonials/michael-poster.jpg",
    quote: "I started at an 830, and I came out with a 1330.",
  },
] as const;

const writtenStories = [
  {
    student: "Tara",
    before: "",
    highlight:
      "I went up 110 points since September. I got my score back this morning and I got a 1490.",
    after: " I just wanted to say thank you for all the help!",
    result: "1490 SAT, up 110 points",
    source: "IMG_0237.PNG",
  },
  {
    student: "@ut.4392",
    before: "Bro I just wanted to hit u up and say thank u so much for all the math tips. ",
    highlight: "I went from 1260 to 1480 with 790 on math.",
    after: "",
    result: "1260 to 1480, 790 Math",
    source: "IMG_8598.PNG",
  },
  {
    student: "@rushanthg",
    before: "Yo I just wanted to let you know ",
    highlight: "I went from a 1300 to a 1480 in 3 weeks",
    after: " because of you on June SAT and I appreciate your help.",
    result: "1300 to 1480 in 3 weeks",
    source: "IMG_8604.PNG",
  },
  {
    student: "plushy",
    before: "",
    highlight: "1280 to 1410 thanks to you bro.",
    after: " I know it's not amazing, but I'm really proud of it.",
    result: "1280 to 1410",
    source: "IMG_0962.PNG",
  },
] as const;

const faqItems = [
  {
    question: "Which plan should I choose?",
    answer:
      "Hobby is a good place to take your first test and try the Foundation course. Core adds more Question Bank work, a second test, and daily drills. Max is for students who also want every course, four tests, a personal study plan, and Scott's weekly calls.",
  },
  {
    question: "Are Core and Max billed monthly?",
    answer:
      "Core is $50 month to month or $120 billed every three months, which works out to $40 per month. Max is $80 per month. You can cancel at any time, and your access continues through the end of the paid billing period.",
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
      "No. The Hobby plan does not require a card. You only enter payment details when you choose Core or Max.",
  },
  {
    question: "What happens on the weekly Max calls?",
    answer:
      "Max members can join Scott's weekly group call and watch the recording afterward. The library also includes recordings from earlier calls on Reading & Writing, math, Desmos, vocabulary, and recent SATs.",
  },
  {
    question: "Will I lose progress if I cancel?",
    answer:
      "No. Your account keeps its course progress, attempts, scores, and study history. Paid features change with your plan, but the work you completed stays attached to your account.",
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
              <Link href="#plans" className={styles.heroPrimary}>
                Enroll Now
              </Link>
            </div>
          </div>

          <div className={styles.heroVisual}>
            <VslCard />
          </div>
        </div>
      </section>

      <section className={styles.planSection} id="plans">
        {billing ? <BillingNotice state={billing} /> : null}
        <SectionHeading title="Pricing" />

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
        <SectionHeading
          title="Inside 1500 Blueprint"
        />
        <div className={styles.featurePanel}>
          <aside className={styles.featurePanelIntro}>
            <div className={styles.featurePanelIcon}>
              <FeatureGlyph name="target" />
            </div>
            <h3>Study tools</h3>
          </aside>
          <div className={styles.featureList}>
            {productFeatures.map((feature) => (
              <article className={styles.featureRow} key={feature.title}>
                <div className={styles.featureIcon}>
                  <FeatureGlyph name={feature.icon} />
                </div>
                <div className={styles.featureRowCopy}>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.savingsSection}>
        <div className={styles.savingsPanel}>
          <div className={styles.savingsCopy}>
            <h2>
              You could save <em>$240 a month</em> compared with tutoring.
            </h2>
            <p>Based on one $80 tutoring session each week.</p>
            <Link href="#plans" className={styles.savingsAction}>
              See Max <ArrowIcon />
            </Link>
          </div>
          <div className={styles.costCard}>
            <div className={styles.costHeader}>
              <span>Monthly comparison</span>
            </div>
            <div className={styles.costRow}>
              <div>
                <strong>Private tutoring</strong>
              </div>
              <b>$320</b>
            </div>
            <div className={styles.costBar} aria-hidden="true"><span /></div>
            <div className={`${styles.costRow} ${styles.maxCostRow}`}>
              <div>
                <strong>1500 Blueprint Max</strong>
              </div>
              <b>$80</b>
            </div>
            <div className={`${styles.costBar} ${styles.maxCostBar}`} aria-hidden="true"><span /></div>
            <div className={styles.savingsTotal}>
              <div>
                <span>You save</span>
                <strong>$240 / month</strong>
              </div>
              <b>75% less</b>
            </div>
            <p>Example only. Tutor rates vary.</p>
          </div>
        </div>
      </section>

      <section className={styles.videoSection} id="stories">
        <div className={styles.storyHeading}>
          <SectionHeading
            title="Hear from students who used the Blueprint."
            description="Students share what helped them prepare, improve, and feel ready for test day."
            dark
          />
        </div>
        <TestimonialVideos stories={videoStories} />
      </section>

      <section className={styles.writtenStoriesSection}>
        <div className={styles.writtenStoriesIntro}>
          <h2>More from students</h2>
        </div>
        <div className={styles.writtenStoryGrid}>
          {writtenStories.map((story) => (
            <article
              className={styles.writtenStory}
              key={story.result}
            >
              <div className={styles.storyAuthor}>
                <div>
                  <strong>{story.student}</strong>
                  <span>{story.result}</span>
                </div>
              </div>
              <p>
                {story.before}
                <span>{story.highlight}</span>
                {story.after}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.faqSection} id="faq">
        <div className={styles.faqLayout}>
          <div className={styles.faqIntro}>
            <h2>A few things to know before you choose.</h2>
            <Link href="/account/login?next=/ultimate" className={styles.faqLink}>
              Already a member? Open the app <ArrowIcon />
            </Link>
          </div>
          <div className={styles.faqList}>
            {faqItems.map((item, index) => (
              <details key={item.question} open={index === 0}>
                <summary>
                  <span>{item.question}</span>
                  <i aria-hidden="true" />
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.finalGrid} aria-hidden="true" />
        <div>
          <h2>Start with Hobby.</h2>
          <p>Take your first full-length test and try the Foundation course for free.</p>
        </div>
        <Link href="/account/sign-up?next=/ultimate" className={styles.finalButton}>Create free account <ArrowIcon /></Link>
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

function FeatureGlyph({ name }: { name: FeatureIcon }) {
  const paths: Record<FeatureIcon, React.ReactNode> = {
    target: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="3" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    chat: <path d="M5 6.5h14v9H11l-5 3v-3H5Z" />,
    bolt: <path d="m13 2-7 11h5l-1 9 8-12h-5Z" />,
    file: <><path d="M7 3h7l4 4v14H7Z" /><path d="M14 3v5h5" /></>,
    calendar: <><rect x="4" y="6" width="16" height="14" rx="2" /><path d="M8 3v5M16 3v5M4 10h16" /></>,
    play: <path d="m9 6 9 6-9 6Z" />,
    star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    chart: <><path d="M4 19V9M10 19V5M16 19v-7M22 19V2" /><path d="M2 19h21" /></>,
    book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23Z" /><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23Z" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5" /></svg>;
}

function PlanCheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}
