import assert from "node:assert/strict";
import test from "node:test";
import {
  runPasswordAccountCreation,
  runPasswordLogin,
  type PasswordAccountDependencies,
  type PasswordLoginDependencies,
} from "./password-workflows";

type FakeUser = { id: string };

function loginDependencies(
  overrides: Partial<PasswordLoginDependencies<FakeUser>> = {},
): PasswordLoginDependencies<FakeUser> {
  return {
    signIn: async () => ({ user: { id: "auth-user" } }),
    recordPasswordLogin: async () => ({ status: "active" }),
    signOutLocal: async () => undefined,
    reportAccountLinkFailure: () => undefined,
    ...overrides,
  };
}

function accountDependencies(
  overrides: Partial<PasswordAccountDependencies<FakeUser, FakeUser>> = {},
): PasswordAccountDependencies<FakeUser, FakeUser> {
  return {
    findExistingAuthUser: async () => null,
    updateExistingPassword: async () => undefined,
    signIn: async () => ({ user: { id: "auth-user" } }),
    recordPasswordLogin: async () => ({ status: "active" }),
    generateSignupLink: async () => ({
      ok: true,
      userId: "auth-user",
      hashedToken: "hashed-token",
    }),
    sendVerification: async () => undefined,
    deleteAuthUser: async () => undefined,
    confirmationUrl: (token) => `https://app.example/account/confirm?token_hash=${token}`,
    reportExistingClaimFailure: () => undefined,
    reportLinkGenerationFailure: () => undefined,
    reportVerificationEmailFailure: () => undefined,
    reportSignupCleanupFailure: () => undefined,
    ...overrides,
  };
}

test("password login keeps invalid credentials generic and performs no account mutation", async () => {
  let accountWrites = 0;
  let signOuts = 0;
  const result = await runPasswordLogin(
    { email: "student@example.com", password: "wrong-password", next: "/drills" },
    loginDependencies({
      signIn: async () => ({ user: null }),
      recordPasswordLogin: async () => {
        accountWrites += 1;
        return { status: "active" };
      },
      signOutLocal: async () => {
        signOuts += 1;
      },
    }),
  );

  assert.deepEqual(result, {
    kind: "state",
    state: {
      status: "error",
      field: "password",
      message: "The email or password is incorrect.",
    },
  });
  assert.equal(accountWrites, 0);
  assert.equal(signOuts, 0);
});

test("password login revokes the local auth session for suspended accounts", async () => {
  let signOuts = 0;
  const result = await runPasswordLogin(
    { email: "student@example.com", password: "Blueprint1500", next: "/ultimate" },
    loginDependencies({
      recordPasswordLogin: async () => ({ status: "suspended" }),
      signOutLocal: async () => {
        signOuts += 1;
      },
    }),
  );

  assert.deepEqual(result, {
    kind: "state",
    state: { status: "error", message: "This student account is not active." },
  });
  assert.equal(signOuts, 1);
});

test("password login fails closed, reports, and signs out when account linking fails", async () => {
  const failure = new Error("database unavailable");
  const reported: unknown[] = [];
  let signOuts = 0;
  const result = await runPasswordLogin(
    { email: "student@example.com", password: "Blueprint1500", next: "/ultimate" },
    loginDependencies({
      recordPasswordLogin: async () => {
        throw failure;
      },
      signOutLocal: async () => {
        signOuts += 1;
      },
      reportAccountLinkFailure: (error) => reported.push(error),
    }),
  );

  assert.deepEqual(result, {
    kind: "state",
    state: {
      status: "error",
      message: "We could not finish signing you in. Please try again shortly.",
    },
  });
  assert.deepEqual(reported, [failure]);
  assert.equal(signOuts, 1);
});

test("active password login returns only the already-sanitized redirect intent", async () => {
  const result = await runPasswordLogin(
    { email: "student@example.com", password: "Blueprint1500", next: "/ultimate/planner" },
    loginDependencies(),
  );
  assert.deepEqual(result, { kind: "redirect", path: "/ultimate/planner" });
});

test("signup generates a verification link and sends it without exposing the raw password", async () => {
  const generatedInputs: unknown[] = [];
  const sent: { email: string; url: string }[] = [];
  const result = await runPasswordAccountCreation(
    {
      email: "student@example.com",
      password: "Blueprint1500",
      displayName: "Student Name",
      next: "/drills",
      redirectTo: "https://app.example/drills",
      claimExisting: false,
    },
    accountDependencies({
      generateSignupLink: async (input) => {
        generatedInputs.push(input);
        return { ok: true, userId: "new-user", hashedToken: "server-hash" };
      },
      sendVerification: async (email, url) => {
        sent.push({ email, url });
      },
    }),
  );

  assert.deepEqual(generatedInputs, [{
    email: "student@example.com",
    password: "Blueprint1500",
    displayName: "Student Name",
    redirectTo: "https://app.example/drills",
  }]);
  assert.deepEqual(sent, [{
    email: "student@example.com",
    url: "https://app.example/account/confirm?token_hash=server-hash",
  }]);
  assert.deepEqual(result, {
    kind: "state",
    state: {
      status: "success",
      message: "Check your email to verify the address and finish setting up your password.",
    },
  });
});

test("signup maps provider account-enumeration errors to the existing safe guidance", async () => {
  const providerError = new Error("User already registered");
  const reported: unknown[] = [];
  const result = await runPasswordAccountCreation(
    {
      email: "student@example.com",
      password: "Blueprint1500",
      displayName: "Student",
      next: "/drills",
      redirectTo: "https://app.example/drills",
      claimExisting: false,
    },
    accountDependencies({
      generateSignupLink: async () => ({ ok: false, error: providerError }),
      reportLinkGenerationFailure: (error) => reported.push(error),
    }),
  );

  assert.deepEqual(result, {
    kind: "state",
    state: {
      status: "error",
      field: "password",
      message: "An account already exists for that email. Sign in or reset the password.",
    },
  });
  assert.deepEqual(reported, [providerError]);
});

test("signup removes the unused auth identity when verification email delivery fails", async () => {
  const sendFailure = new Error("email unavailable");
  const cleanupFailure = new Error("cleanup unavailable");
  const deleted: string[] = [];
  const reportedSend: unknown[] = [];
  const reportedCleanup: unknown[] = [];
  const result = await runPasswordAccountCreation(
    {
      email: "student@example.com",
      password: "Blueprint1500",
      displayName: "Student",
      next: "/drills",
      redirectTo: "https://app.example/drills",
      claimExisting: false,
    },
    accountDependencies({
      sendVerification: async () => {
        throw sendFailure;
      },
      deleteAuthUser: async (userId) => {
        deleted.push(userId);
        throw cleanupFailure;
      },
      reportVerificationEmailFailure: (error) => reportedSend.push(error),
      reportSignupCleanupFailure: (error) => reportedCleanup.push(error),
    }),
  );

  assert.deepEqual(result, {
    kind: "state",
    state: {
      status: "error",
      message: "We could not send the verification email. Please try again.",
    },
  });
  assert.deepEqual(deleted, ["auth-user"]);
  assert.deepEqual(reportedSend, [sendFailure]);
  assert.deepEqual(reportedCleanup, [cleanupFailure]);
});

test("legacy account claim updates and signs in the matching auth identity without creating another", async () => {
  const calls: string[] = [];
  const result = await runPasswordAccountCreation(
    {
      email: "legacy@example.com",
      password: "Blueprint1500",
      displayName: null,
      next: "/ultimate",
      redirectTo: "https://app.example/ultimate",
      claimExisting: true,
    },
    accountDependencies({
      findExistingAuthUser: async () => {
        calls.push("find");
        return { id: "existing-user" };
      },
      updateExistingPassword: async (id) => {
        calls.push(`update:${id}`);
      },
      signIn: async () => {
        calls.push("sign-in");
        return { user: { id: "existing-user" } };
      },
      recordPasswordLogin: async () => {
        calls.push("record");
        return { status: "active" };
      },
      generateSignupLink: async () => {
        calls.push("generate");
        return { ok: true, userId: "unexpected", hashedToken: "unexpected" };
      },
    }),
  );

  assert.deepEqual(result, { kind: "redirect", path: "/ultimate" });
  assert.deepEqual(calls, ["find", "update:existing-user", "sign-in", "record"]);
});

test("legacy account claim fails closed when the updated identity cannot sign in", async () => {
  const failure = new Error("sign in failed");
  const reported: unknown[] = [];
  const result = await runPasswordAccountCreation(
    {
      email: "legacy@example.com",
      password: "Blueprint1500",
      displayName: null,
      next: "/ultimate",
      redirectTo: "https://app.example/ultimate",
      claimExisting: true,
    },
    accountDependencies({
      findExistingAuthUser: async () => ({ id: "existing-user" }),
      signIn: async () => ({ user: null, error: failure }),
      reportExistingClaimFailure: (error) => reported.push(error),
    }),
  );

  assert.deepEqual(result, {
    kind: "state",
    state: {
      status: "error",
      message: "We could not link that existing login. Please try again.",
    },
  });
  assert.deepEqual(reported, [failure]);
});
