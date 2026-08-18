import Link from "next/link";
import { PageHeader } from "@/components/ultimate/PageHeader";
import { ChevronRightIcon } from "@/components/shell/icons";

export const metadata = { title: "Ask Scott" };

const prompts = [
  { label: "Quiz me on a weak skill", href: "/ultimate/drills" },
  { label: "Help me choose a practice test", href: "/ultimate/tests" },
  { label: "Review the questions I missed", href: "/ultimate/history" },
  { label: "Ask the student community", href: "/ultimate/community" },
];

export default function AskScottPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-64px)] w-full max-w-[940px] flex-col px-4 py-8 sm:px-7">
      <PageHeader
        eyebrow="Guided SAT help"
        title="Ask Scott"
        description="This is the private home for the future tutoring assistant. The current integration routes students to working, source-backed help while its conversation engine is connected."
      />

      <div className="flex flex-1 items-center justify-center py-8">
        <section className="w-full max-w-2xl rounded-[18px] border border-navy/10 bg-white p-6 text-center shadow-pop sm:p-8">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border-[3px] border-brand text-brand">
            <span className="h-5 w-5 rounded-full border-[3px] border-sky bg-brand" />
          </span>
          <h2 className="mt-5 font-display text-2xl font-extrabold tracking-tight text-ink">What do you want to work on?</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-navy/50">
            Conversation history and AI responses are not connected yet. These shortcuts use the live learning system today.
          </p>
          <div className="mt-6 grid gap-2 text-left sm:grid-cols-2">
            {prompts.map((prompt) => (
              <Link key={prompt.href} href={prompt.href} className="flex min-h-12 items-center gap-2 rounded-xl border border-navy/10 bg-haze/55 px-4 text-sm font-semibold text-navy hover:border-brand/35 hover:bg-ice/60">
                <span className="min-w-0 flex-1">{prompt.label}</span>
                <ChevronRightIcon className="h-4 w-4 text-navy/35" />
              </Link>
            ))}
          </div>
          <div className="mt-6 flex min-h-14 items-center rounded-xl border border-dashed border-navy/15 bg-white px-4 text-left text-sm text-navy/35">
            Ask Scott anything…
            <span className="ml-auto rounded-lg bg-navy/10 px-3 py-1.5 text-xs font-bold">Coming next</span>
          </div>
        </section>
      </div>
    </div>
  );
}
