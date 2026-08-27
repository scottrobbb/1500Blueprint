import Link from "next/link";
import { LayersIcon } from "@/components/flashcards/icons";
import { ChevronRightIcon, HistoryIcon, TestsIcon } from "@/components/shell/icons";

const PATHWAYS = [
  {
    title: "Practice tests",
    description: "Full-length digital SAT practice",
    href: "/practice-test",
    Icon: TestsIcon,
  },
  {
    title: "Flashcards",
    description: "Review saved vocabulary",
    href: "/flashcards",
    Icon: LayersIcon,
  },
  {
    title: "History",
    description: "Past scores and completed sessions",
    href: "/history",
    Icon: HistoryIcon,
  },
] as const;

export function StudyPathways() {
  return (
    <section aria-labelledby="study-pathways-heading" className="mx-auto w-full max-w-[1080px] px-4 pt-9 sm:px-6">
      <h2 id="study-pathways-heading" className="mb-3 font-display text-lg font-semibold text-navy">
        More ways to study
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {PATHWAYS.map(({ title, description, href, Icon }) => (
          <Link
            key={title}
            href={href}
            className="group flex min-h-32 flex-col rounded-xl border border-navy/12 bg-white p-5 transition-colors hover:border-navy/25 hover:bg-navy/[0.02]"
          >
            <div className="flex items-start justify-between gap-4">
              <Icon className="h-5 w-5 text-navy/55" />
              <ChevronRightIcon className="h-4 w-4 text-navy/35 group-hover:text-navy" />
            </div>
            <h3 className="mt-5 font-semibold text-navy">{title}</h3>
            <p className="mt-1 text-sm text-navy/50">{description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
