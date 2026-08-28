import "server-only";

import { safeErrorMetadata } from "./error-metadata";

type ErrorContext = {
  correlationId?: string;
  method?: string;
  provider?: "anthropic" | "stripe" | "supabase" | "resend" | "next";
  route?: string;
  source?: string;
  expectedLivemode?: boolean;
  receivedLivemode?: boolean;
};

export function reportServerError(
  event: string,
  error: unknown,
  context: ErrorContext = {},
): void {
  console.error(JSON.stringify({
    severity: "error",
    event,
    ...context,
    error: safeErrorMetadata(error),
  }));
}
