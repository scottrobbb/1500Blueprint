// Purely informational, so there is nothing to click and no link to follow.
// Whether it shows at all is decided by the page from request time, since a
// component may not read a clock during render.
export function MaintenanceBanner() {
  return (
    <section
      role="status"
      className="mb-5 rounded-2xl border border-flag/25 bg-flag-bg px-4 py-3 text-sm font-semibold text-flag"
    >
      Scheduled maintenance tonight at midnight. The site will be down 12:00&ndash;12:15&nbsp;AM ET.
    </section>
  );
}
