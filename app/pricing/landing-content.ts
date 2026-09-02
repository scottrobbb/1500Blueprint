import type { PlanFeature } from "./PlansPanel";

// Copy shared by the single-tier landing pages. The pricing page keeps its own
// definitions; see the note in PricingLanding.tsx.
export const HERO_VSL_URL = "https://vimeo.com/1221856607?share=copy&fl=sv&fe=ci";
export const TESTIMONIAL_REEL_URL = "https://vimeo.com/1221904969?share=copy&fl=sv&fe=ci";

export type FaqItem = { question: string; answer: string };

export const freeFeatures: PlanFeature[] = [
  { label: "200 questions (20 Challenge Questions)", icon: "grid" },
  { label: "1 full-length adaptive digital SAT", icon: "file" },
  { label: "Desmos 101 course", icon: "book" },
  { label: "Reading & Writing 101 course", icon: "book" },
];

export const coreFeatures: PlanFeature[] = [
  { label: "1250+ Questions (with Desmos explanations + challenge questions)", icon: "grid" },
  { label: "2 full-length adaptive digital SATs", icon: "file" },
  { label: "20 practice drills each day", icon: "bolt" },
  { label: "Everything in Free", icon: "check" },
];

// "Everything in Core" is dropped here: with Free and Core off the page it
// points at tiers the reader cannot see, and everything it stood for is already
// named above it.
export const maxFeatures: PlanFeature[] = [
  { label: "1250+ Questions (with Desmos explanations + challenge questions)", icon: "grid" },
  { label: "5 full-length adaptive digital SATs", icon: "file" },
  { label: "Unlimited daily drills", icon: "bolt" },
  { label: "Access to all courses, quizzes, and flashcards", icon: "book" },
  { label: "Weekly group calls with Scott (recorded)", icon: "star" },
  { label: "Max Discord Role", icon: "chat" },
];

export const insideColumns: Array<{ title: string; art: string; items: string[] }> = [
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

/* ------------------------------- /free -------------------------------- */

// Scoped to what the Free plan actually includes -- the pricing page's hero
// lists the full Max feature set, which would not be true here.
export const freeHeroChecklist = [
  "1 realistic full-length practice test",
  "200 Question Bank questions, including 20 Challenge Questions",
  "Desmos 101 course",
  "Reading & Writing 101 course",
  "No card required",
] as const;

export const freeFaq: readonly FaqItem[] = [
  {
    question: "What's included in the Free plan?",
    answer:
      "Free gives you a full-length adaptive practice test, 200 Question Bank questions including 20 Challenge Questions, and the Desmos 101 and Reading & Writing 101 courses, so you can start preparing without paying.",
  },
  {
    question: "Do I need a card to start?",
    answer: "No. The Free plan does not require a card. Create an account and start practicing.",
  },
  {
    question: "How do I get started?",
    answer:
      "Create your account, then open the app. Your practice test, Question Bank access, and courses are available right away.",
  },
  {
    question: "Will I lose progress later?",
    answer:
      "No. Your account keeps its course progress, attempts, scores, and study history. The work you complete stays attached to your account.",
  },
  {
    question: "Can I share my account with someone else?",
    answer:
      "No. Each Blueprint account is licensed for one student only and may not be shared, transferred, or used by multiple people.\n\nWe may monitor for unusual login or usage patterns that indicate account sharing. If an account is found to be shared, access may be restricted or suspended.",
  },
];

export const freePlanFootnote =
  "The Free plan does not require a card, and your progress stays on your account.";

/* -------------------------------- /max -------------------------------- */

export const maxHeroChecklist = [
  "5 Realistic Full-Length Practice Tests",
  "1250+ Question Bank Qs (with Desmos explanations)",
  "Step-by-step math and reading courses",
  "Weekly group class with Scott",
  "On-Demand Video Library, updated weekly",
  "Realistic challenge questions (built for 1400+ scorers)",
  "Targeted drills for grammar, reading, and vocab",
] as const;

export const maxFaq: readonly FaqItem[] = [
  {
    question: "What do I get with Max?",
    answer:
      "Everything the Blueprint offers: every published full-length practice test, the full 1250+ Question Bank with Desmos explanations and Challenge Questions, unlimited daily drills, all courses, quizzes and flashcards, the Max Discord role, and weekly live group calls with Scott.",
  },
  {
    question: "How is Max billed?",
    answer:
      "Max is $80/month, or $210 every 3 months — saving you $30 and bringing the effective price down to $70/month.\n\nYou can cancel anytime and keep access through the end of your current billing period.",
  },
  {
    question: "What happens on the weekly Max calls?",
    answer:
      "Each week, Scott hosts a live SAT strategy and problem-solving session covering topics like Math, Reading & Writing, Desmos, vocabulary, test strategy, and recent SAT questions. Calls are focused on breaking down difficult concepts, working through challenging problems, and showing you how to approach the SAT more effectively.\n\nCan't make it live? Every call is recorded, and Max members get access to the full library of past sessions.",
  },
  {
    question: "What is covered by the refund policy?",
    answer:
      "Your first purchase is covered by a 24-hour refund window. Contact support within that window if the plan is not the right fit.",
  },
  {
    question: "Will I lose progress if I cancel?",
    answer:
      "No. Your account keeps its course progress, attempts, scores, and study history. Paid features change with your plan, but the work you completed stays attached to your account.",
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
];

export const maxPlanFootnote =
  "Max is billed monthly or every three months. It can be cancelled anytime, and your first purchase has a 24-hour refund window.";
