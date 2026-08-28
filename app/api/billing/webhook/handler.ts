import type Stripe from "stripe";
import { safeErrorLabel } from "@/lib/observability/error-metadata";
import { readTextBody, RequestBodyTooLargeError } from "@/lib/security/request";

const MAX_WEBHOOK_BYTES = 1024 * 1024;

export type WebhookClaim = {
  kind: "claimed" | "processed" | "processing";
  attempt: number;
};

export type WebhookHandlerDeps = {
  webhookSecret: () => string | null;
  constructEvent: (payload: string, signature: string, secret: string) => Stripe.Event;
  expectedLivemode: () => boolean;
  claimEvent: (event: Stripe.Event) => Promise<WebhookClaim>;
  processEvent: (event: Stripe.Event) => Promise<void>;
  finishEvent: (eventId: string, attempt: number) => Promise<void>;
  failEvent: (eventId: string, attempt: number, message: string) => Promise<void>;
  reportError: (event: string, error: unknown, context: Record<string, unknown>) => void;
};

export function createWebhookPostHandler(deps: WebhookHandlerDeps) {
  return async function webhookPost(request: Request): Promise<Response> {
    const signature = request.headers.get("stripe-signature");
    const webhookSecret = deps.webhookSecret();
    if (!signature || !webhookSecret) {
      return Response.json({ error: "Stripe webhook is not configured" }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
      const payload = await readTextBody(request, MAX_WEBHOOK_BYTES);
      event = deps.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return Response.json({ error: "Webhook payload is too large" }, { status: 413 });
      }
      deps.reportError("billing.webhook.signature_failed", error, {
        provider: "stripe",
        route: "/api/billing/webhook",
        method: "POST",
      });
      return Response.json({ error: "Invalid webhook signature" }, { status: 400 });
    }

    const expectedLivemode = deps.expectedLivemode();
    if (event.livemode !== expectedLivemode) {
      deps.reportError("billing.webhook.mode_mismatch", new Error("Stripe mode mismatch"), {
        provider: "stripe",
        route: "/api/billing/webhook",
        method: "POST",
        correlationId: event.id,
        expectedLivemode,
        receivedLivemode: event.livemode,
      });
      return Response.json({ error: "Stripe webhook mode mismatch" }, { status: 400 });
    }

    let claimedAttempt: number | null = null;
    try {
      const claim = await deps.claimEvent(event);
      if (claim.kind === "processed") return Response.json({ received: true, duplicate: true });
      if (claim.kind === "processing") {
        return Response.json({ error: "Webhook event is already processing" }, { status: 409 });
      }
      claimedAttempt = claim.attempt;

      await deps.processEvent(event);
      await deps.finishEvent(event.id, claimedAttempt);
      return Response.json({ received: true });
    } catch (error) {
      if (claimedAttempt !== null) {
        await deps.failEvent(event.id, claimedAttempt, safeErrorLabel(error));
      }
      deps.reportError("billing.webhook.processing_failed", error, {
        provider: "stripe",
        route: "/api/billing/webhook",
        method: "POST",
        correlationId: event.id,
      });
      return Response.json({ error: "Webhook processing failed" }, { status: 500 });
    }
  };
}
