import { Resend } from "resend";

// Lazily created so an empty key never throws at import/build time.
let client: Resend | null = null;
function resend(): Resend {
  if (!client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not configured");
    client = new Resend(key);
  }
  return client;
}

const DEFAULT_FROM_ADDRESS = "login@1500satblueprint.com";
const VERIFIED_FROM_DOMAIN = "1500satblueprint.com";

// Vercel can preserve an empty or quoted environment value. Normalize it here
// and refuse to let EMAIL_FROM override the domain verified in Resend.
function fromHeader(): string {
  const configured = process.env.EMAIL_FROM?.trim();
  const raw = stripWrappingQuotes(configured || DEFAULT_FROM_ADDRESS);
  const bracketed = raw.match(/^(.*?)\s*<([^<>]+)>$/);
  const address = (bracketed?.[2] ?? raw).trim().toLowerCase();
  const domain = address.split("@")[1]?.toLowerCase();

  if (!isEmailAddress(address) || domain !== VERIFIED_FROM_DOMAIN) {
    console.warn(
      `Ignoring EMAIL_FROM with domain "${domain ?? "missing"}"; ` +
        `magic links must use ${VERIFIED_FROM_DOMAIN}.`,
    );
    return `1500 Blueprint <${DEFAULT_FROM_ADDRESS}>`;
  }

  const name = bracketed?.[1]?.trim() || "1500 Blueprint";
  return `${name} <${address}>`;
}

export async function sendMagicLink(email: string, url: string): Promise<void> {
  await sendLinkEmail({
    email,
    url,
    subject: "Your 1500 Blueprint login link",
    heading: "Sign in to your account",
    introduction: "Tap the button below to log in. This link works once and expires in 15 minutes.",
    buttonLabel: "Log in to 1500 Blueprint",
    text:
      `Sign in to 1500 Blueprint:\n\n${url}\n\n` +
      `This link works once and expires in 15 minutes. If you didn't request it, you can ignore this email.`,
  });
}

export async function sendAccountVerification(email: string, url: string): Promise<void> {
  await sendLinkEmail({
    email,
    url,
    subject: "Verify your 1500 Blueprint account",
    heading: "Verify your email",
    introduction: "Confirm your email address to finish setting up your password login.",
    buttonLabel: "Verify email",
    text:
      `Verify your 1500 Blueprint account:\n\n${url}\n\n` +
      `If you didn't create this login, you can ignore this email.`,
  });
}

export async function sendPasswordReset(email: string, url: string): Promise<void> {
  await sendLinkEmail({
    email,
    url,
    subject: "Reset your 1500 Blueprint password",
    heading: "Reset your password",
    introduction: "Use the secure link below to choose a new password.",
    buttonLabel: "Reset password",
    text:
      `Reset your 1500 Blueprint password:\n\n${url}\n\n` +
      `If you didn't request a password reset, you can ignore this email.`,
  });
}

type LinkEmail = {
  email: string;
  url: string;
  subject: string;
  heading: string;
  introduction: string;
  buttonLabel: string;
  text: string;
};

async function sendLinkEmail(message: LinkEmail): Promise<void> {
  const { error } = await resend().emails.send({
    from: fromHeader(),
    to: message.email,
    subject: message.subject,
    text: message.text,
    html: render(message),
  });
  if (error) {
    throw new Error(
      `failed to send auth email (${error.name}, ${error.statusCode ?? "unknown status"}): ` +
        error.message,
    );
  }
}

function stripWrappingQuotes(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function isEmailAddress(value: string): boolean {
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
}

function render(message: LinkEmail): string {
  const url = escapeHtml(message.url);
  return `
  <div style="margin:0;padding:24px 16px;background:#eef2f7;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid rgba(11,42,91,0.10);box-shadow:0 12px 40px rgba(7,25,59,0.12);">
      <div style="padding:28px 32px;background:#0b2a5b;background-image:linear-gradient(110deg,rgba(124,203,255,0.20) 0%,transparent 46%),linear-gradient(130deg,#07193b 0%,#0b2a5b 55%,#1b46a8 100%);">
        <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em;line-height:1;">
          <span style="color:#ffffff;">1500</span>
          <span style="color:#7ccbff;">SAT</span>
          <span style="color:#ffffff;">Blueprint</span>
        </div>
        <div style="margin-top:7px;font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#7ccbff;">Aim for 1500</div>
      </div>

      <div style="padding:32px;color:#1a233e;">
        <h1 style="margin:0 0 10px;font-size:21px;font-weight:800;letter-spacing:-0.01em;color:#0b2a5b;">${escapeHtml(message.heading)}</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#41506b;">
          ${escapeHtml(message.introduction)}
        </p>
        <a href="${url}" style="display:inline-block;background:#3fa9f5;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:11px;box-shadow:0 2px 0 #2b8fe0;">
          ${escapeHtml(message.buttonLabel)}
        </a>
        <p style="margin:26px 0 0;font-size:13px;line-height:1.6;color:#8a93a6;">
          If you didn't request this, you can safely ignore this email. If the button doesn't work, paste this link into your browser:
        </p>
        <p style="margin:8px 0 0;font-size:13px;line-height:1.5;">
          <a href="${url}" style="color:#2b8fe0;word-break:break-all;text-decoration:none;">${url}</a>
        </p>
      </div>

      <div style="padding:16px 32px;border-top:1px solid rgba(11,42,91,0.08);background:#f8fafc;">
        <p style="margin:0;font-size:12px;color:#8a93a6;">1500 Blueprint · Not affiliated with the College Board.</p>
      </div>
    </div>
  </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
