// Announcement for the Blueprint Accelerator reading course, shown to everyone.
//
// Fixed brand artwork with white type burned on, like the live-call banner
// beside it: data-theme="light" pins the tokens so the gradient and the type
// keep their contrast in dark mode instead of inverting with the palette.
const bannerClassName =
  "mb-5 rounded-2xl bg-[linear-gradient(110deg,#0b2a5b_0%,#1b46a8_60%,#2b8fe0_100%)] px-4 py-3 text-white shadow-[0_10px_28px_-16px_rgba(27,70,168,0.7)]";

export function AcceleratorBanner() {
  return (
    <div data-theme="light" className={bannerClassName}>
      <p className="text-sm font-bold">
        Blueprint Accelerator, our new reading course, releases around September 20 for Blueprint
        Max users.
      </p>
    </div>
  );
}
