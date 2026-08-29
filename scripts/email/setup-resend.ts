/**
 * Creates the Resend Segment, Topic, and signed delivery webhook used by the
 * student email lifecycle, then starts a Supabase-backed Contact import.
 *
 * Dry-run/list only:
 *   npm run email:setup
 *
 * Apply external Resend changes:
 *   npm run email:setup -- --apply
 *
 * Requires a full-access RESEND_MANAGEMENT_API_KEY. A send-only key is not
 * sufficient for Contacts, Segments, Topics, Broadcasts, or Webhooks.
 */
import { randomBytes } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { Resend, type WebhookEvent } from "resend";

loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const key = process.env.RESEND_MANAGEMENT_API_KEY?.trim();
const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://www.1500satblueprint.com").replace(/\/$/, "");
if (!key) throw new Error("RESEND_MANAGEMENT_API_KEY is required");

const resend = new Resend(key);
const segmentName = "Blueprint Students";
const topicName = "Live call reminders";
const webhookEndpoint = `${appUrl}/api/email/webhook`;
const webhookEvents: WebhookEvent[] = [
  "email.scheduled",
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.opened",
  "email.clicked",
  "email.failed",
  "email.suppressed",
  "contact.created",
  "contact.updated",
  "contact.deleted",
];

async function main() {
  const [segments, topics, webhooks] = await Promise.all([
    resend.segments.list({ limit: 100 }),
    resend.topics.list(),
    resend.webhooks.list({ limit: 100 }),
  ]);
  if (segments.error || topics.error || webhooks.error) {
    throw segments.error ?? topics.error ?? webhooks.error;
  }

  let segmentId = segments.data?.data.find((item) => item.name === segmentName)?.id ?? null;
  const existingTopic = topics.data?.data.find((item) => item.name === topicName) ?? null;
  let topicId = existingTopic?.id ?? null;
  const webhook = webhooks.data?.data.find((item) => item.endpoint === webhookEndpoint) ?? null;
  let webhookSecret: string | null = null;

  if (!apply) {
    console.log(JSON.stringify({
      apply: false,
      segment: segmentId ? "exists" : "would_create",
      topic: topicId ? "exists" : "would_create",
      webhook: webhook ? "exists" : "would_create",
      endpoint: webhookEndpoint,
    }, null, 2));
    return;
  }

  if (!segmentId) {
    const created = await resend.segments.create({ name: segmentName });
    if (created.error || !created.data) throw created.error ?? new Error("Segment was not created");
    segmentId = created.data.id;
  }
  if (!topicId) {
    const created = await resend.topics.create({
      name: topicName,
      description: "Reminders for scheduled 1500 Blueprint live sessions.",
      defaultSubscription: "opt_in",
    });
    if (created.error || !created.data) throw created.error ?? new Error("Topic was not created");
    topicId = created.data.id;
  } else if (existingTopic?.default_subscription !== "opt_in") {
    throw new Error("The existing live-call Topic must use opt_in as its default subscription");
  }
  if (!webhook) {
    const created = await resend.webhooks.create({ endpoint: webhookEndpoint, events: webhookEvents });
    if (created.error || !created.data) throw created.error ?? new Error("Webhook was not created");
    webhookSecret = created.data.signing_secret;
  } else {
    const updated = await resend.webhooks.update(webhook.id, { status: "enabled", events: webhookEvents });
    if (updated.error) throw updated.error;
  }

  process.env.RESEND_STUDENT_SEGMENT_ID = segmentId;
  process.env.RESEND_LIVE_CALL_TOPIC_ID = topicId;
  const { seedEligibleStudentContacts, startPendingContactImport } = await import("../../lib/email/audience");
  const seeded = await seedEligibleStudentContacts();
  const contactImportId = await startPendingContactImport();

  console.log(JSON.stringify({
    apply: true,
    RESEND_STUDENT_SEGMENT_ID: segmentId,
    RESEND_LIVE_CALL_TOPIC_ID: topicId,
    RESEND_WEBHOOK_SECRET: webhookSecret ?? "copy the existing signing secret from the Resend webhook page",
    CRON_SECRET: process.env.CRON_SECRET ? "already configured" : randomBytes(24).toString("base64url"),
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO?.trim() || "configure a monitored support address",
    EMAIL_PHYSICAL_ADDRESS: process.env.EMAIL_PHYSICAL_ADDRESS?.trim() || "configure the business mailing address",
    seededContacts: seeded,
    contactImportId,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : "ResendSetupError");
  process.exitCode = 1;
});
