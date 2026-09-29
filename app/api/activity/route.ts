// Active-time reports from ActivityTracker, sent about once a minute (and on
// tab hide via sendBeacon). The seconds are capped here and again in the RPC,
// which also refuses more time than has passed since the last report.

import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { recordActiveTime } from "@/lib/activity/dailyActivity";
import { isSameOriginRequest, readJsonBody } from "@/lib/security/request";

const MAX_REPORT_SECONDS = 120;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return new NextResponse(null, { status: 401 });
  if (!isSameOriginRequest(request)) return new NextResponse(null, { status: 403 });

  let seconds: unknown;
  try {
    seconds = ((await readJsonBody(request, 256)) as { seconds?: unknown } | null)?.seconds;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    await recordActiveTime(session.email, Math.min(seconds, MAX_REPORT_SECONDS));
  } catch {
    // Tracking is best-effort: a missing migration or a blip must never
    // surface to the student.
    return new NextResponse(null, { status: 202 });
  }
  return new NextResponse(null, { status: 204 });
}
