// The scheduled maintenance window, as UTC instants.
//
// Written in UTC rather than as a local wall clock because the US East Coast
// is on EDT (UTC-4) in September, not EST -- a literal "EST" offset would put
// the window an hour off. Midnight ET on 7 September 2026 is 04:00 UTC, and
// the work is expected to take a quarter of an hour.
const WINDOW_ENDS_AT = Date.parse("2026-09-07T04:15:00Z");

// The notice takes itself down when the window closes: a maintenance banner
// that outlives the maintenance is worse than no banner at all.
export function maintenanceNoticeVisible(now: number): boolean {
  return now < WINDOW_ENDS_AT;
}

// Request time is data the page awaits, not something it reads mid-render --
// the same shape as getLiveWeeklyCall resolving its own window server-side.
// That keeps the render a pure function of what was loaded, which is what the
// React purity rule is protecting.
export async function loadMaintenanceNotice(): Promise<boolean> {
  return maintenanceNoticeVisible(Date.now());
}
