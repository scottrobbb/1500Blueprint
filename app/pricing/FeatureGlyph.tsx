export type FeatureIcon =
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

export function FeatureGlyph({ name }: { name: FeatureIcon }) {
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
