import "server-only";

import { reportServerError } from "@/lib/observability/server";
import { checkRateLimit } from "./rate-limit";
import type { RateLimitResult } from "./rate-limit-result";

type WindowPolicy = {
  name: "burst" | "daily";
  limit: number;
  windowSeconds: number;
};

type ProtectedContentPolicy = {
  surface: "course-lesson" | "drill-session" | "practice-test" | "question-bank-session";
  scope?: string;
  windows: readonly WindowPolicy[];
};

export type ProtectedContentReadResult = {
  allowed: boolean;
  degraded: boolean;
  resetsAt?: string;
};

type Dependencies = {
  check: (
    scope: string,
    discriminator: string,
    options: { limit: number; windowSeconds: number },
  ) => Promise<RateLimitResult | null>;
  report: (event: string, error: unknown, context: { source: string }) => void;
};

const DEFAULT_DEPENDENCIES: Dependencies = {
  check: checkRateLimit,
  report: reportServerError,
};

const QUESTION_BANK_POLICY: ProtectedContentPolicy = {
  surface: "question-bank-session",
  windows: [
    { name: "burst", limit: 8, windowSeconds: 60 },
    { name: "daily", limit: 60, windowSeconds: 24 * 60 * 60 },
  ],
};

const POLICIES: readonly { matches: (pathname: string) => boolean; policy: ProtectedContentPolicy }[] = [
  {
    matches: (pathname) => /^\/ultimate\/bank\/(?:math|reading-writing)\/practice\/?$/.test(pathname),
    policy: QUESTION_BANK_POLICY,
  },
  {
    matches: (pathname) => pathname !== "/practice-test/completed"
      && (
        /^\/practice-test\/[^/]+\/?$/.test(pathname)
        || /^\/practice-test\/[^/]+\/module\/[^/]+\/?$/.test(pathname)
      ),
    policy: {
      surface: "practice-test",
      scope: "practice-test-runner-v2",
      windows: [
        { name: "burst", limit: 30, windowSeconds: 60 },
        { name: "daily", limit: 120, windowSeconds: 24 * 60 * 60 },
      ],
    },
  },
  {
    matches: (pathname) => /^\/drills\/[^/]+\/?$/.test(pathname),
    policy: {
      surface: "drill-session",
      windows: [
        { name: "burst", limit: 20, windowSeconds: 60 },
        { name: "daily", limit: 180, windowSeconds: 24 * 60 * 60 },
      ],
    },
  },
  {
    matches: (pathname) => /^\/ultimate\/courses\/[^/]+\/[^/]+\/?$/.test(pathname),
    policy: {
      surface: "course-lesson",
      windows: [
        { name: "burst", limit: 60, windowSeconds: 60 },
        { name: "daily", limit: 300, windowSeconds: 24 * 60 * 60 },
      ],
    },
  },
];

export function protectedContentPolicy(pathname: string): ProtectedContentPolicy | null {
  return POLICIES.find((entry) => entry.matches(pathname))?.policy ?? null;
}

/**
 * Applies account-scoped anomaly limits at the page boundary. Limit keys are
 * hashed by checkRateLimit, and telemetry deliberately excludes the account and
 * requested content identifier. A limiter outage degrades open for reads so a
 * monitoring dependency cannot take the paid product offline.
 */
export async function enforceProtectedContentRead(
  email: string,
  pathname: string,
  dependencies: Dependencies = DEFAULT_DEPENDENCIES,
): Promise<ProtectedContentReadResult> {
  const policy = protectedContentPolicy(pathname);
  if (!policy) return { allowed: true, degraded: false };

  const results = await Promise.all(policy.windows.map(async (window) => ({
    window,
    result: await dependencies.check(
      `protected-content:${policy.scope ?? policy.surface}:${window.name}`,
      email,
      { limit: window.limit, windowSeconds: window.windowSeconds },
    ),
  })));
  const exhausted = results.filter(
    (entry): entry is typeof entry & { result: RateLimitResult } => entry.result !== null && !entry.result.allowed,
  );
  if (exhausted.length === 0) {
    return { allowed: true, degraded: results.some((entry) => entry.result === null) };
  }

  const resetsAt = exhausted
    .map((entry) => entry.result.resetsAt)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  dependencies.report(
    "security.protected_content.read_limit_exceeded",
    {
      name: "ProtectedContentReadLimitExceeded",
      code: `${policy.surface}:${exhausted.map((entry) => entry.window.name).join(":")}`,
    },
    { source: policy.surface },
  );
  return { allowed: false, degraded: false, resetsAt };
}
