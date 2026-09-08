const SURVEY_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeNMZj2yfWoCiXUhh8jgK4Thr05WnxE6CZkrIh6a8LHS5lVug/viewform?usp=header";

// The survey lives on Google Forms, so the call to action is its own link
// rather than the whole banner: opening a new tab is a deliberate click, not
// something a student should trigger by aiming near the text.
export function SurveyBanner() {
  return (
    <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-navy/10 bg-white px-4 py-3">
      <p className="text-sm font-bold text-ink">Take the August 2026 Blueprint Survey</p>
      <a
        href={SURVEY_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-10 flex-none items-center justify-center rounded-xl bg-brand px-4 text-sm font-bold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Take survey
      </a>
    </section>
  );
}
