import { resendWebhookClient } from "@/lib/email/client";
import { resendWebhookSecret } from "@/lib/email/config";
import { recordResendWebhook } from "@/lib/email/webhooks";
import { reportServerError } from "@/lib/observability/server";
import { readTextBody, RequestBodyTooLargeError } from "@/lib/security/request";

const MAX_WEBHOOK_BYTES = 1024 * 1024;

export async function POST(request: Request) {
  const secret = resendWebhookSecret();
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!secret || !id || !timestamp || !signature) {
    return Response.json({ error: "Resend webhook is not configured" }, { status: 400 });
  }

  try {
    const payload = await readTextBody(request, MAX_WEBHOOK_BYTES);
    const event = resendWebhookClient().webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: secret,
    });
    const result = await recordResendWebhook(id, event);
    return Response.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    reportServerError("email.webhook.failed", error, {
      provider: "resend",
      route: "/api/email/webhook",
      method: "POST",
      correlationId: id,
    });
    return Response.json(
      { error: error instanceof RequestBodyTooLargeError ? "Webhook payload is too large" : "Invalid Resend webhook" },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
  }
}
