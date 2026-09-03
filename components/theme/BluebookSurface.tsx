// The digital SAT replica is deliberately faithful to College Board's Bluebook,
// which students only ever see in its light theme. Pinning the subtree keeps the
// exam and its score report on the light palette while the rest of the app
// follows the student's dark-mode choice.
//
// `display: contents` keeps the wrapper out of layout; it exists only to scope
// the palette variables the Tailwind color utilities resolve against.
export function BluebookSurface({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="light" className="contents">
      {children}
    </div>
  );
}
