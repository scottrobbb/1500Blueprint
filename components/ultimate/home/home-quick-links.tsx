import Link from "next/link";
import type { ComponentType } from "react";
import { CommunityIcon } from "@/components/community/icons";
import { LayersIcon } from "@/components/flashcards/icons";
import { ChevronRightIcon, HistoryIcon, QuestionBankIcon } from "@/components/shell/icons";

type QuickLink = {
  href: string;
  title: string;
  Icon: ComponentType<{ className?: string }>;
};

const QUICK_LINKS: QuickLink[] = [
  { href: "/ultimate/bank", title: "Question Bank", Icon: QuestionBankIcon },
  { href: "/ultimate/flashcards", title: "Flashcards", Icon: LayersIcon },
  { href: "/ultimate/history", title: "Practice history", Icon: HistoryIcon },
  { href: "/ultimate/community", title: "Community", Icon: CommunityIcon },
];

export function HomeQuickLinks() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3">
        <h2 className="font-display text-2xl font-extrabold tracking-[-0.025em] text-ink">Quick links</h2>
      </div>
      <aside className="flex flex-1 flex-col overflow-hidden rounded-[20px] border border-navy/10 bg-white">
        {QUICK_LINKS.map((link) => (
          <QuickLinkRow key={link.href} href={link.href} title={link.title} Icon={link.Icon} />
        ))}
      </aside>
    </div>
  );
}

function QuickLinkRow({ href, title, Icon }: QuickLink) {
  return (
    <Link
      href={href}
      className="group flex flex-1 items-center gap-3 border-b border-navy/10 px-4 py-3 transition-colors last:border-b-0 hover:bg-navy/[0.02] sm:px-5"
    >
      <span className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-navy/10 bg-haze text-navy/65">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 text-sm font-semibold leading-none text-navy sm:text-[15px]">{title}</span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-navy/20 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
    </Link>
  );
}
