import "server-only";

const DEFAULT_FROM_ADDRESS = "login@1500satblueprint.com";
const VERIFIED_FROM_DOMAIN = "1500satblueprint.com";

export type ResendBroadcastConfig = {
  segmentId: string;
  topicId: string;
};

export function emailFromHeader(): string {
  const configured = process.env.EMAIL_FROM?.trim();
  const raw = stripWrappingQuotes(configured || DEFAULT_FROM_ADDRESS);
  const bracketed = raw.match(/^(.*?)\s*<([^<>]+)>$/);
  const address = (bracketed?.[2] ?? raw).trim().toLowerCase();
  const domain = address.split("@")[1]?.toLowerCase();

  if (!isEmailAddress(address) || domain !== VERIFIED_FROM_DOMAIN) {
    console.warn(`Ignoring EMAIL_FROM outside ${VERIFIED_FROM_DOMAIN}.`);
    return `1500 Blueprint <${DEFAULT_FROM_ADDRESS}>`;
  }

  const name = bracketed?.[1]?.trim() || "1500 Blueprint";
  return `${name} <${address}>`;
}

export function emailReplyTo(): string[] | undefined {
  const value = process.env.EMAIL_REPLY_TO?.trim().toLowerCase();
  return value && isEmailAddress(value) ? [value] : undefined;
}

export function resendBroadcastConfig(): ResendBroadcastConfig | null {
  const segmentId = process.env.RESEND_STUDENT_SEGMENT_ID?.trim();
  const topicId = process.env.RESEND_LIVE_CALL_TOPIC_ID?.trim();
  return segmentId && topicId ? { segmentId, topicId } : null;
}

export function resendWebhookSecret(): string | null {
  return process.env.RESEND_WEBHOOK_SECRET?.trim() || null;
}

export function emailPhysicalAddress(): string | null {
  return process.env.EMAIL_PHYSICAL_ADDRESS?.trim() || null;
}

export function isEmailBroadcastConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim()
    && process.env.RESEND_MANAGEMENT_API_KEY?.trim()
    && resendBroadcastConfig()
    && resendWebhookSecret()
    && emailReplyTo()
    && emailPhysicalAddress(),
  );
}

function stripWrappingQuotes(value: string): string {
  if (
    value.length >= 2
    && ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function isEmailAddress(value: string): boolean {
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
}
