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
