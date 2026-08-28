import { NextResponse } from "next/server";
import type { BillingAccount } from "@/lib/billing/accounts";
import { billingReturnPath } from "@/lib/billing/return-path";
import { isSameOriginRequest, readUrlEncodedForm, RequestBodyTooLargeError } from "@/lib/security/request";

const MAX_FORM_BYTES = 16 * 1024;

export type PortalHandlerDeps = {
  baseUrl: (requestUrl: string) => string;
  getSession: () => Promise<{ email: string } | null>;
  findAccount: (email: string) => Promise<BillingAccount | null>;
  consumeRateLimit: (scope: string, key: string, options: { limit: number; windowSeconds: number }) => Promise<{ allowed: boolean }>;
  createPortal: (customerId: string, returnUrl: string) => Promise<{ url: string }>;
  reportError: (event: string, error: unknown, context: Record<string, unknown>) => void;
};

export function createPortalPostHandler(deps: PortalHandlerDeps) {
  return async function portalPost(request: Request): Promise<Response> {
    const baseUrl = deps.baseUrl(request.url);
    if (!isSameOriginRequest(request, baseUrl)) return new Response("Forbidden", { status: 403 });

    let formData: URLSearchParams;
    try {
      formData = await readUrlEncodedForm(request, MAX_FORM_BYTES);
    } catch (error) {
      return new Response(
        error instanceof RequestBodyTooLargeError ? "Request body is too large" : "Invalid form body",
        { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
      );
    }
    const returnPath = billingReturnPath(formData.get("returnTo"));

    try {
      const session = await deps.getSession();
      if (!session) {
        return NextResponse.redirect(
          `${baseUrl}/account/login?next=${encodeURIComponent(returnPath)}`,
          303,
        );
      }

      const account = await deps.findAccount(session.email);
      if (!account?.stripeCustomerId) return NextResponse.redirect(`${baseUrl}/pricing`, 303);
      const rate = await deps.consumeRateLimit("stripe-portal", account.id, { limit: 10, windowSeconds: 60 });
      if (!rate.allowed) return NextResponse.redirect(`${baseUrl}/settings/subscription?billing=rate-limit`, 303);

      const portal = await deps.createPortal(
        account.stripeCustomerId,
        new URL(returnPath, baseUrl).toString(),
      );
      return NextResponse.redirect(portal.url, 303);
    } catch (error) {
      deps.reportError("billing.portal.failed", error, {
        provider: "stripe",
        route: "/api/billing/portal",
        method: "POST",
      });
      const errorUrl = new URL(returnPath, baseUrl);
      errorUrl.searchParams.set("billing", "error");
      return NextResponse.redirect(errorUrl, 303);
    }
  };
}
