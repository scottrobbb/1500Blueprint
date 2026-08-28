import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveLegacySessionToken,
  resolvePasswordSession,
  resolveSession,
  type LegacySessionDependencies,
  type PasswordSessionDependencies,
  type Session,
} from "./session";

function legacyDependencies(
  overrides: Partial<LegacySessionDependencies> = {},
): LegacySessionDependencies {
  return {
    verifyToken: async () => ({ subject: " Student@Example.COM ", plan: "core" }),
    hasActiveAccount: async () => true,
    hasComplimentaryAccess: async () => true,
    ...overrides,
  };
}

function passwordDependencies(
  overrides: Partial<PasswordSessionDependencies> = {},
): PasswordSessionDependencies {
  return {
    getClaims: async () => ({ claims: { email: " Student@Example.COM ", sub: "auth-user" } }),
    hasActiveAccount: async () => true,
    ...overrides,
  };
}

test("legacy session normalizes its subject and rechecks active account status", async () => {
  const checked: string[] = [];
  const session = await resolveLegacySessionToken("signed-token", legacyDependencies({
    hasActiveAccount: async (email) => {
      checked.push(email);
      return true;
    },
  }));

  assert.deepEqual(session, {
    email: "student@example.com",
    plan: "core",
    userId: null,
    authMethod: "legacy",
  });
  assert.deepEqual(checked, ["student@example.com"]);
});

test("legacy sessions fail closed for invalid tokens, inactive accounts, and status lookup errors", async () => {
  assert.equal(await resolveLegacySessionToken("bad", legacyDependencies({
    verifyToken: async () => { throw new Error("invalid signature"); },
  })), null);
  assert.equal(await resolveLegacySessionToken("valid", legacyDependencies({
    hasActiveAccount: async () => false,
  })), null);
  assert.equal(await resolveLegacySessionToken("valid", legacyDependencies({
    hasActiveAccount: async () => { throw new Error("database unavailable"); },
  })), null);
});

test("legacy complimentary sessions are revoked when the current grant is absent", async () => {
  let grantChecks = 0;
  const session = await resolveLegacySessionToken("valid", legacyDependencies({
    verifyToken: async () => ({ subject: "student@example.com", plan: "complimentary" }),
    hasComplimentaryAccess: async () => {
      grantChecks += 1;
      return false;
    },
  }));
  assert.equal(session, null);
  assert.equal(grantChecks, 1);
});

test("ordinary legacy plans do not invoke the complimentary-grant lookup", async () => {
  let grantChecks = 0;
  const session = await resolveLegacySessionToken("valid", legacyDependencies({
    hasComplimentaryAccess: async () => {
      grantChecks += 1;
      return false;
    },
  }));
  assert.equal(session?.plan, "core");
  assert.equal(grantChecks, 0);
});

test("password session binds normalized email and auth subject to an active account", async () => {
  const checked: { email: string; userId: string }[] = [];
  const session = await resolvePasswordSession(passwordDependencies({
    hasActiveAccount: async (email, userId) => {
      checked.push({ email, userId });
      return true;
    },
  }));
  assert.deepEqual(session, {
    email: "student@example.com",
    plan: null,
    userId: "auth-user",
    authMethod: "password",
  });
  assert.deepEqual(checked, [{ email: "student@example.com", userId: "auth-user" }]);
});

test("password sessions fail closed for invalid claims, inactive accounts, and lookup errors", async () => {
  assert.equal(await resolvePasswordSession(passwordDependencies({
    getClaims: async () => ({ error: new Error("expired") }),
  })), null);
  assert.equal(await resolvePasswordSession(passwordDependencies({
    getClaims: async () => ({ claims: { email: "student@example.com" } }),
  })), null);
  assert.equal(await resolvePasswordSession(passwordDependencies({
    hasActiveAccount: async () => false,
  })), null);
  assert.equal(await resolvePasswordSession(passwordDependencies({
    hasActiveAccount: async () => { throw new Error("database unavailable"); },
  })), null);
});

test("session resolver prefers a valid legacy session without touching password auth", async () => {
  const legacy: Session = {
    email: "legacy@example.com",
    plan: "core",
    userId: null,
    authMethod: "legacy",
  };
  let passwordCalls = 0;
  const session = await resolveSession({
    legacySession: async () => legacy,
    passwordSession: async () => {
      passwordCalls += 1;
      return null;
    },
  });
  assert.equal(session, legacy);
  assert.equal(passwordCalls, 0);
});

test("session resolver falls back to password auth only after legacy rejection", async () => {
  const password: Session = {
    email: "password@example.com",
    plan: null,
    userId: "auth-user",
    authMethod: "password",
  };
  const calls: string[] = [];
  const session = await resolveSession({
    legacySession: async () => {
      calls.push("legacy");
      return null;
    },
    passwordSession: async () => {
      calls.push("password");
      return password;
    },
  });
  assert.equal(session, password);
  assert.deepEqual(calls, ["legacy", "password"]);
});
