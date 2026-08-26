"use client";

import { useSyncExternalStore } from "react";

// Server-rendered pages don't know the viewer's timezone. useSyncExternalStore
// with a null server snapshot renders nothing during SSR/hydration, then
// swaps in the real browser zone on the client — no hydration mismatch, no
// setState-in-effect. Stays silent when that zone matches the call's own.
function subscribe(): () => void { return () => {}; }
function getSnapshot(): string { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
function getServerSnapshot(): string | null { return null; }

export function LocalCallTime({
  startsAt,
  endsAt,
  sourceTimeZone,
  className,
}: {
  startsAt: string;
  endsAt: string;
  sourceTimeZone: string;
  className?: string;
}) {
  const localTimeZone = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!localTimeZone || localTimeZone === sourceTimeZone) return null;

  const start = formatTime(startsAt, localTimeZone);
  const end = formatTime(endsAt, localTimeZone);
  const zone = zoneAbbreviation(startsAt, localTimeZone);

  return <span className={className}>{start}–{end} {zone} your time</span>;
}

function formatTime(value: string, timeZone: string): string {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}

function zoneAbbreviation(value: string, timeZone: string): string {
  const parts = new Date(value).toLocaleTimeString("en-US", { timeZoneName: "short", timeZone }).split(" ");
  return parts[parts.length - 1];
}
