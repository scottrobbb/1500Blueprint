import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import styles from "./pricing.module.css";

export const metadata: Metadata = {
  title: "Pricing — 1500 SAT Blueprint",
  description: "Compare Free, Core, and Max access for 1500 SAT Blueprint.",
};

type FeatureIcon = "target" | "grid" | "chat" | "bolt" | "file" | "calendar" | "play" | "star" | "check";

type PlanFeature = {
  label: string;
  icon: FeatureIcon;
};

const freeFeatures: PlanFeature[] = [
  { label: "300 Question Bank questions", icon: "grid" },
  { label: "1 full-length practice test", icon: "file" },
  { label: "Desmos 101 course", icon: "target" },
  { label: "Reading & Writing 101 course", icon: "play" },
];

const blueprintFeatures: PlanFeature[] = [
  { label: "3,000+ questions, including Challenge", icon: "grid" },
  { label: "2 full-length practice tests", icon: "file" },
  { label: "Up to 20 drills per day", icon: "bolt" },
  { label: "Desmos 101 and R&W 101 courses", icon: "play" },
  { label: "Discord Core role", icon: "chat" },
];

const proFeatures: PlanFeature[] = [
  { label: "Everything in Core", icon: "check" },
  { label: "10 tests with Desmos explanations", icon: "target" },
  { label: "Unlimited daily drills", icon: "bolt" },
  { label: "Every course and advanced track", icon: "play" },
  { label: "Weekly live group classes and recordings", icon: "star" },
  { label: "Personal study planner", icon: "calendar" },
  { label: "Discord Max role", icon: "chat" },
];

export default function PricingPage() {
  return (
    <main className={styles.page}>
      <div className={styles.saleBar}>
        <LockIcon />
        <strong>Choose the access that fits your prep</strong>
        <span aria-hidden="true" />
        <em>Upgrade anytime</em>
      </div>

      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="1500 SAT Blueprint home">
          <Logo withWordmark={false} className={styles.logoMark} />
          <strong>1500 SAT Blueprint</strong>
        </Link>
        <nav aria-label="Pricing navigation">
          <Link href="/practice-test">Practice tests</Link>
          <Link href="/pricing" aria-current="page">Pricing</Link>
        </nav>
        <Link href="/login" className={styles.openApp}>Open app</Link>
      </header>

      <section className={styles.content}>
        <div className={styles.hero}>
          <p className={styles.eyebrow}>Simple monthly pricing</p>
          <h1>All plans</h1>
          <div className={styles.accessOptions} aria-label="Plan terms">
            <span>Start free</span>
            <span>Upgrade anytime</span>
            <strong>Keep your progress when plans change</strong>
          </div>
          <p className={styles.included}>
            Every account keeps its course progress, attempts, scores, and study history.
          </p>
        </div>

        <div className={styles.planGrid}>
          <PriceCard
            tier="free"
            name="Free"
            description="Start with a real diagnostic and find your weak spots."
            features={freeFeatures}
            cta="Get started"
          />
          <PriceCard
            tier="blueprint"
            name="Core"
            price="39"
            description="Daily structured practice and the complete Core question library."
            features={blueprintFeatures}
            cta="Get Core"
          />
          <PriceCard
            tier="pro"
            name="Max"
            price="80"
            description="Scott’s complete system, every test, every course, and live support."
            features={proFeatures}
            cta="Get Max"
            popular
          />
        </div>

        <p className={styles.bottomLink}>
          Already have access? <Link href="/login">Open the app <ArrowIcon /></Link>
        </p>
      </section>
    </main>
  );
}

function PriceCard({
  tier,
  name,
  oldPrice,
  price,
  description,
  features,
  cta,
  popular = false,
}: {
  tier: "free" | "blueprint" | "pro";
  name: string;
  oldPrice?: string;
  price?: string;
  description: string;
  features: PlanFeature[];
  cta: string;
  popular?: boolean;
}) {
  const paid = tier !== "free";

  return (
    <article className={`${styles.card} ${styles[tier]}`}>
      {popular && (
        <div className={styles.popularBadge}>
          <SparkIcon /> Most popular <SparkIcon />
        </div>
      )}

      <PlanArt tier={tier} />

      <div className={styles.planTitle}>
        <h2>{name}</h2>
        {paid && <span>Exam pass</span>}
      </div>

      <div className={styles.priceRow}>
        {paid ? (
          <>
            {oldPrice ? <s>${oldPrice}</s> : null}
            <strong>${price}</strong>
            <span className={styles.saleChip}>/ month</span>
          </>
        ) : (
          <strong>Free</strong>
        )}
      </div>

      <p className={styles.paymentNote}>{paid ? "Monthly access · cancel anytime" : "No card required"}</p>
      <p className={styles.description}>{description}</p>

      <ul className={styles.features}>
        {features.map((feature) => (
          <li key={feature.label}>
            <FeatureGlyph name={feature.icon} />
            <span>{feature.label}</span>
          </li>
        ))}
      </ul>

      <div className={styles.actions}>
        <Link href="/login" className={styles.primaryAction}>{cta}</Link>
        {paid && (
          <a
            className={styles.secondaryAction}
            href={`mailto:?subject=${encodeURIComponent(`1500 SAT ${name}`)}&body=${encodeURIComponent(`Can you help me get the ${name} exam pass?`)}`}
          >
            Ask a parent to pay
          </a>
        )}
      </div>
    </article>
  );
}

function PlanArt({ tier }: { tier: "free" | "blueprint" | "pro" }) {
  if (tier === "free") {
    return (
      <div className={`${styles.planArt} ${styles.freeArt}`} aria-hidden="true">
        <span />
      </div>
    );
  }

  if (tier === "blueprint") {
    return (
      <div className={`${styles.planArt} ${styles.blueprintArt}`} aria-hidden="true">
        <svg viewBox="0 0 170 170">
          <circle cx="85" cy="85" r="58" />
          <circle cx="85" cy="85" r="38" />
          <circle cx="85" cy="85" r="16" />
          <path d="M85 8 92 69 154 85 92 101 85 162 78 101 16 85 78 69Z" />
        </svg>
        <SparkIcon />
      </div>
    );
  }

  return (
    <div className={`${styles.planArt} ${styles.proArt}`}>
      <span className={styles.bluLabel}>Blu&apos;s pick</span>
      <BluMascot />
    </div>
  );
}

function BluMascot() {
  return (
    <div className={styles.bluMascot}>
      <Image
        className={styles.bluImage}
        src="/images/blu.png"
        alt="Blu, the 1500 mascot"
        width={500}
        height={500}
        priority
      />
      <span className={styles.bluSparkOne} aria-hidden="true" />
      <span className={styles.bluSparkTwo} aria-hidden="true" />
    </div>
  );
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
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function LockIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
}

function SparkIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 2.3 6.7L21 11l-6.7 2.3L12 20l-2.3-6.7L3 11l6.7-2.3Z" /></svg>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5" /></svg>;
}
