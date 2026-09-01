import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const AUTH_BOUNDARY = /getSession|getAdminSession|getExplanationEditorSession|getQuestionContentEditorSession|webhooks\.constructEvent|consumeLoginToken|exchangeCodeForSession|verifyOtp|auth\.signOut/;
const PUBLIC_ROUTES = new Set([
  "app/account/confirm/route.ts",
  "app/api/auth/callback/route.ts",
  "app/api/auth/request/route.ts",
  "app/api/billing/webhook/route.ts",
]);

function routeFiles(directory = join(ROOT, "app")): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

// Challenge was originally derived by regex over a question's content.source
// archive path, before it became a stored difficulty. That derivation is a
// second source of truth: the source string never changes, so any code still
// consulting it silently overrides an admin's edit -- a question demoted out of
// Challenge snapped straight back to it. The stored tier is the only input.
test("nothing derives the Challenge tier from a question's source archive", () => {
  const offenders = [
    "lib/question-bank/math.ts",
    "lib/question-bank/math-queries.ts",
    "lib/question-bank/reading-writing-queries.ts",
    "lib/drills/admin-queries.ts",
    "components/admin/QuestionBank.tsx",
    "app/admin/api/question-bank/assign-free-tier/route.ts",
  ].filter((path) => /archivePath|source,document/i.test(source(path)));
  assert.deepEqual(offenders, [], "these still sniff content.source for Challenge");
});

test("every non-public route has an explicit server authentication boundary", () => {
  const missing = routeFiles()
    .map((path) => relative(ROOT, path))
    .filter((path) => !PUBLIC_ROUTES.has(path) && !AUTH_BOUNDARY.test(source(path)));
  assert.deepEqual(missing, []);
});

test("admin and manager routes use their scoped authorization boundary", () => {
  for (const absolutePath of routeFiles()) {
    const path = relative(ROOT, absolutePath);
    const contents = source(path);
    if (path.startsWith("app/admin/api/") || path.startsWith("app/api/admin/")) {
      assert.match(contents, /getAdminSession/, `${path} must require an admin session`);
    }
    if (path.startsWith("app/api/manager/")) {
      assert.match(
        contents,
        /getExplanationEditorSession|getQuestionContentEditorSession/,
        `${path} must require a scoped staff session`,
      );
    }
  }
});

test("route handlers never parse an unbounded JSON body", () => {
  const unsafe = routeFiles()
    .map((path) => relative(ROOT, path))
    .filter((path) => /(?:request|req)\.json\s*\(/.test(source(path)));
  assert.deepEqual(unsafe, []);
});

test("public and payment-sensitive endpoints retain their abuse controls", () => {
  const authRequest = source("app/api/auth/request/route.ts");
  assert.match(authRequest, /consumeRateLimit/);
  assert.match(authRequest, /readJsonBody/);

  const webhook = source("app/api/billing/webhook/route.ts")
    + source("app/api/billing/webhook/handler.ts");
  assert.match(webhook, /constructEvent/);
  assert.match(webhook, /readTextBody/);
  assert.match(webhook, /billingLivemode/);

  for (const path of ["app/api/billing/checkout/route.ts", "app/api/billing/portal/route.ts"]) {
    const contents = source(path) + source(path.replace("route.ts", "handler.ts"));
    assert.match(contents, /isSameOriginRequest/, `${path} must reject cross-origin mutations`);
    assert.match(contents, /consumeRateLimit/, `${path} must be rate limited`);
    assert.match(contents, /readUrlEncodedForm/, `${path} must bound form parsing`);
  }

});

test("global request limits and private API caching remain configured", () => {
  const config = source("next.config.ts");
  assert.match(config, /proxyClientMaxBodySize:\s*["']6mb["']/);
  assert.match(config, /bodySizeLimit:\s*["']64kb["']/);
  assert.match(config, /source:\s*["']\/api\/:path\*["'][\s\S]*Cache-Control[\s\S]*no-store/);
});

test("public and authenticated entry points converge on pricing and Ultimate", () => {
  assert.match(source("app/page.tsx"), /redirect\(["']\/pricing["']\)/);
  assert.match(source("app/drills/page.tsx"), /redirect\(["']\/ultimate["']\)/);
  assert.match(source("app/api/auth/callback/route.ts"), /destinationAfterMagicLink/);
  assert.match(source("lib/auth/password.ts"), /DEFAULT_AUTH_DESTINATION\s*=\s*["']\/ultimate["']/);
  assert.match(source("proxy.ts"), /const PUBLIC_PATHS\s*=\s*\[[^\]]*["']\/["']/);
  assert.match(source("proxy.ts"), /["']\/robots\.txt["']/);
  assert.match(source("proxy.ts"), /["']\/sitemap\.xml["']/);
});

test("checkout authentication preserves a safe local return path", () => {
  for (const path of ["app/account/login/page.tsx", "app/account/sign-up/page.tsx"]) {
    const contents = source(path);
    assert.match(contents, /safeNextPath/);
    assert.match(contents, /searchParams/);
    assert.match(contents, /redirect\(next\)/);
    assert.match(contents, /<PasswordAuthForm[^>]*next=\{next\}/);
  }
});

test("high-frequency student database mutations retain distributed rate limits", () => {
  const mutationRoutes = [
    "app/api/courses/lessons/[id]/completion/route.ts",
    "app/api/courses/practice-attempts/route.ts",
    "app/api/drills/progress/route.ts",
    "app/api/drills/targeted-math/session/route.ts",
    "app/api/drills/vocab/answer/route.ts",
    "app/api/drills/vocab/flashcards/route.ts",
    "app/api/drills/vocab/session/route.ts",
    "app/api/drills/vocab/settings/route.ts",
    "app/api/onboarding/complete/route.ts",
    "app/api/profile/route.ts",
    "app/api/question-bank/math/attempt/route.ts",
    "app/api/question-bank/reading-writing/attempt/route.ts",
    "app/api/question-bank/saves/route.ts",
    "app/api/questions/report/route.ts",
    "app/api/settings/progress/route.ts",
    "app/api/study-activity/route.ts",
    "app/api/tests/session/route.ts",
  ];
  for (const path of mutationRoutes) {
    assert.match(source(path), /checkRateLimit|consumeRateLimit/, `${path} must be rate limited`);
  }

});

test("high-value content reads retain account anomaly controls and bounded delivery", () => {
  assert.match(source("proxy.ts"), /enforceProtectedContentRead/);
  assert.match(source("lib/question-bank/math-queries.ts"), /boundedQuestionBankSessionLimit/);
  assert.match(source("lib/question-bank/reading-writing-queries.ts"), /boundedQuestionBankSessionLimit/);
  assert.match(
    source("components/ultimate/question-bank/math/MathBankCatalog.tsx"),
    /href=\{allPracticeHref\}[\s\S]*?prefetch=\{false\}/,
  );
});

// The course-lesson protected-content policy rate-limits every
// /ultimate/courses/[slug]/[lesson] read. Next.js prefetches every visible
// Link by default, so any lesson link left without prefetch={false} silently
// burns that budget as soon as its page renders -- the course outline sidebar
// (rendered on every lesson page) and the full module lesson list (rendered
// on every course overview page) are the worst offenders since they list
// every lesson in the course at once.
test("every link into a rate-limited course lesson disables prefetch", () => {
  const lessonPage = source("app/ultimate/courses/[courseSlug]/[lessonSlug]/page.tsx");
  const lessonLinkPattern = /href=\{`\/ultimate\/courses\/\$\{course\.slug\}\/\$\{item\.slug\}`\} prefetch=\{false\}/g;
  assert.equal((lessonPage.match(lessonLinkPattern) ?? []).length, 2, "both outline sidebars (mobile + desktop)");
  assert.match(lessonPage, /href=\{`\/ultimate\/courses\/\$\{course\.slug\}\/\$\{previous\.slug\}`\} prefetch=\{false\}/);
  assert.match(lessonPage, /href=\{`\/ultimate\/courses\/\$\{course\.slug\}\/\$\{next\.slug\}`\} prefetch=\{false\}/);

  const coursePage = source("app/ultimate/courses/[courseSlug]/page.tsx");
  assert.match(coursePage, /href=\{`\/ultimate\/courses\/\$\{course\.slug\}\/\$\{nextLesson\.slug\}`\} prefetch=\{false\}/);
  assert.match(coursePage, /href=\{`\/ultimate\/courses\/\$\{course\.slug\}\/\$\{lesson\.slug\}`\} prefetch=\{false\}/);

  // The home page's two lesson links moved into components/ultimate/home when
  // that page was split into components. Only these two resolve to a lesson URL
  // -- the dashboard's other links (/ultimate/drills, /ultimate/courses,
  // /ultimate/bank) point at index pages that carry no read policy.
  assert.match(
    source("components/ultimate/home/home-sections.tsx"),
    /href=\{continueHref\}\s+prefetch=\{false\}/,
  );
  assert.match(
    source("components/ultimate/home/home-course-card.tsx"),
    /href=\{href\}\s+prefetch=\{false\}/,
  );
});
