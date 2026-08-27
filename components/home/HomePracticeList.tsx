import Link from "next/link";
import { ChevronRightIcon } from "@/components/shell/icons";
import type { DrillSlug, QuestionStatus } from "@/lib/drills/types";

type PracticeLink = {
  title: string;
  href: string;
  slug: DrillSlug;
};

const GROUPS: Array<{ title: string; links: PracticeLink[] }> = [
  {
    title: "Reading and writing",
    links: [
      { title: "Grammar", href: "/drills/grammar", slug: "grammar" },
      { title: "Reading", href: "/drills/reading", slug: "reading" },
      { title: "Word scan", href: "/drills/word-scan?mode=ceased", slug: "word-scan" },
    ],
  },
  {
    title: "Math",
    links: [
      { title: "Targeted math", href: "/drills/targeted-math?difficulty=medium", slug: "targeted-math" },
      { title: "Adaptive math", href: "/drills/ai-math", slug: "ai-math" },
    ],
  },
  {
    title: "Vocabulary",
    links: [
      { title: "Vocabulary", href: "/drills/vocab", slug: "vocab" },
      { title: "Saved words", href: "/drills/flashcards", slug: "flashcards" },
    ],
  },
];

export function HomePracticeList({
  isAdmin,
  publication,
}: {
  isAdmin: boolean;
  publication: Partial<Record<DrillSlug, QuestionStatus>>;
}) {
  const groups = GROUPS.map((group) => ({
    ...group,
    links: group.links.filter((link) => isAdmin || publication[link.slug] === "published"),
  })).filter((group) => group.links.length > 0);

  if (groups.length === 0) return null;

  return (
    <section
      id="practice-drills"
      aria-labelledby="practice-drills-heading"
      className="mx-auto w-full max-w-[1080px] scroll-mt-24 px-4 pb-14 pt-9 sm:px-6 sm:pb-16"
    >
      <h2 id="practice-drills-heading" className="mb-4 font-display text-lg font-semibold text-navy">
        Practice by skill
      </h2>
      <div className="grid gap-5 md:grid-cols-3">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="mb-2 text-sm font-semibold text-navy/65">{group.title}</h3>
            <div className="overflow-hidden rounded-xl border border-navy/12 bg-white">
              {group.links.map((link, index) => {
                const draft = publication[link.slug] !== "published";
                return (
                  <Link
                    key={link.title}
                    href={link.href}
                    className={`group flex min-h-14 items-center justify-between gap-4 px-4 py-3.5 font-medium text-navy transition-colors hover:bg-navy/[0.025] ${
                      index > 0 ? "border-t border-navy/10" : ""
                    }`}
                  >
                    <span>
                      {link.title}
                      {isAdmin && draft ? <span className="ml-2 text-xs font-normal text-navy/45">Draft</span> : null}
                    </span>
                    <ChevronRightIcon className="h-4 w-4 flex-none text-navy/35 group-hover:text-navy" />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
