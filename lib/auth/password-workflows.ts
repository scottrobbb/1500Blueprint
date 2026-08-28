export type AuthWorkflowState = {
  status: "idle" | "error" | "success";
  message: string;
  field?: "name" | "email" | "password" | "confirmPassword";
};

export type AuthWorkflowResult =
  | { kind: "redirect"; path: string }
  | { kind: "state"; state: AuthWorkflowState };

type PasswordAccount = {
  status: "active" | "suspended" | "archived";
};

export type PasswordLoginDependencies<User> = {
  signIn(credentials: { email: string; password: string }): Promise<{ user: User | null }>;
  recordPasswordLogin(user: User): Promise<PasswordAccount>;
  signOutLocal(): Promise<void>;
  reportAccountLinkFailure(error: unknown): void;
};

export async function runPasswordLogin<User>(
  input: { email: string; password: string; next: string },
  dependencies: PasswordLoginDependencies<User>,
): Promise<AuthWorkflowResult> {
  const signedIn = await dependencies.signIn({ email: input.email, password: input.password });
  if (!signedIn.user) {
    return state(fieldError("password", "The email or password is incorrect."));
  }

  try {
    const account = await dependencies.recordPasswordLogin(signedIn.user);
    if (account.status !== "active") {
      await dependencies.signOutLocal();
      return state({ status: "error", message: "This student account is not active." });
    }
  } catch (error) {
    dependencies.reportAccountLinkFailure(error);
    await dependencies.signOutLocal();
    return state({
      status: "error",
      message: "We could not finish signing you in. Please try again shortly.",
    });
  }

  return { kind: "redirect", path: input.next };
}

export type PasswordAccountDependencies<User, ExistingUser extends { id: string }> = {
  findExistingAuthUser(email: string): Promise<ExistingUser | null>;
  updateExistingPassword(userId: string, password: string): Promise<void>;
  signIn(credentials: { email: string; password: string }): Promise<{ user: User | null; error?: unknown }>;
  recordPasswordLogin(user: User): Promise<PasswordAccount>;
  generateSignupLink(input: {
    email: string;
    password: string;
    displayName: string | null;
    redirectTo: string;
  }): Promise<
    | { ok: true; userId: string; hashedToken: string }
    | { ok: false; error: unknown }
  >;
  sendVerification(email: string, url: string): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
  confirmationUrl(tokenHash: string): string;
  reportExistingClaimFailure(error: unknown): void;
  reportLinkGenerationFailure(error: unknown): void;
  reportVerificationEmailFailure(error: unknown): void;
  reportSignupCleanupFailure(error: unknown): void;
};

export async function runPasswordAccountCreation<User, ExistingUser extends { id: string }>(
  input: {
    email: string;
    password: string;
    displayName: string | null;
    next: string;
    redirectTo: string;
    claimExisting: boolean;
  },
  dependencies: PasswordAccountDependencies<User, ExistingUser>,
): Promise<AuthWorkflowResult> {
  if (input.claimExisting) {
    try {
      const existingAuthUser = await dependencies.findExistingAuthUser(input.email);
      if (existingAuthUser) {
        await dependencies.updateExistingPassword(existingAuthUser.id, input.password);
        const signedIn = await dependencies.signIn({ email: input.email, password: input.password });
        if (!signedIn.user) {
          throw signedIn.error ?? new Error("updated auth user could not sign in");
        }
        await dependencies.recordPasswordLogin(signedIn.user);
        return { kind: "redirect", path: input.next };
      }
    } catch (error) {
      dependencies.reportExistingClaimFailure(error);
      return state({
        status: "error",
        message: "We could not link that existing login. Please try again.",
      });
    }
  }

  const generated = await dependencies.generateSignupLink({
    email: input.email,
    password: input.password,
    displayName: input.displayName,
    redirectTo: input.redirectTo,
  });
  if (!generated.ok) {
    dependencies.reportLinkGenerationFailure(generated.error);
    return state(fieldError("password", friendlyPasswordError(errorMessage(generated.error))));
  }

  try {
    await dependencies.sendVerification(
      input.email,
      dependencies.confirmationUrl(generated.hashedToken),
    );
  } catch (error) {
    dependencies.reportVerificationEmailFailure(error);
    try {
      await dependencies.deleteAuthUser(generated.userId);
    } catch (cleanupError) {
      dependencies.reportSignupCleanupFailure(cleanupError);
    }
    return state({
      status: "error",
      message: "We could not send the verification email. Please try again.",
    });
  }

  return state({
    status: "success",
    message: "Check your email to verify the address and finish setting up your password.",
  });
}

function state(value: AuthWorkflowState): AuthWorkflowResult {
  return { kind: "state", state: value };
}

function fieldError(field: AuthWorkflowState["field"], message: string): AuthWorkflowState {
  return { status: "error", message, field };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to generate verification link";
}

export function friendlyPasswordError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("already") || normalized.includes("registered")) {
    return "An account already exists for that email. Sign in or reset the password.";
  }
  if (normalized.includes("password") && normalized.includes("weak")) {
    return "Choose a stronger password with a mix of letters and numbers.";
  }
  if (normalized.includes("rate") || normalized.includes("security")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  return "We could not create that login. Try again or reset the password.";
}
