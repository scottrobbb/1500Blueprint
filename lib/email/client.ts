import "server-only";

import { Resend } from "resend";

let client: Resend | null = null;
let managementClient: Resend | null = null;
let webhookClient: Resend | null = null;

export function resendClient(): Resend {
  if (!client) {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) throw new Error("RESEND_API_KEY is not configured");
    client = new Resend(key);
  }
  return client;
}

export function resendManagementClient(): Resend {
  if (!managementClient) {
    const key = process.env.RESEND_MANAGEMENT_API_KEY?.trim();
    if (!key) throw new Error("RESEND_MANAGEMENT_API_KEY is not configured");
    managementClient = new Resend(key);
  }
  return managementClient;
}

export function resendWebhookClient(): Resend {
  webhookClient ??= new Resend();
  return webhookClient;
}
