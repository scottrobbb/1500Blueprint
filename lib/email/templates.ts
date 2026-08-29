import "server-only";

import type { WeeklyCall } from "@/lib/calls/types";
import { emailPhysicalAddress } from "./config";

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

type LinkEmailInput = {
  subject: string;
  preview: string;
  heading: string;
  introduction: string;
  buttonLabel: string;
  url: string;
  securityNote: string;
};

export function authLinkEmail(input: LinkEmailInput): RenderedEmail {
  return {
    subject: input.subject,
    text: `${input.heading}\n\n${input.introduction}\n\n${input.buttonLabel}: ${input.url}\n\n${input.securityNote}`,
    html: emailDocument({
      preview: input.preview,
      heading: input.heading,
      body: `<p style="${paragraphStyle}">${escapeHtml(input.introduction)}</p>`,
      action: { label: input.buttonLabel, url: input.url },
      footer: `<p style="${smallStyle}">${escapeHtml(input.securityNote)}</p>`,
    }),
  };
}

export function welcomeEmail(firstName: string | null, appUrl: string): RenderedEmail {
  const greeting = firstName ? `Welcome, ${firstName}.` : "Welcome to 1500 Blueprint.";
  const introduction = "Your account is ready. Start with your available courses, then use practice and full tests to measure what is improving.";
  return {
    subject: "Welcome to 1500 Blueprint",
    text: `${greeting}\n\n${introduction}\n\nOpen your workspace: ${appUrl}`,
    html: emailDocument({
      preview: "Your 1500 Blueprint account is ready.",
      heading: greeting,
      body: `<p style="${paragraphStyle}">${escapeHtml(introduction)}</p>`,
      action: { label: "Open your workspace", url: appUrl },
      footer: `<p style="${smallStyle}">You received this because you created a 1500 Blueprint account.</p>`,
    }),
  };
}

export function liveCallReminderEmail(call: WeeklyCall, callsUrl: string, calendarUrl: string): RenderedEmail {
  const when = formatCallDateTime(call.startsAt, call.endsAt, call.timezone);
  const destination = call.meetingUrl ?? callsUrl;
  const focus = call.focusTopic ? `<p style="${detailStyle}"><strong>Focus:</strong> ${escapeHtml(call.focusTopic)}</p>` : "";
  const description = call.description ? `<p style="${paragraphStyle}">${escapeHtml(call.description)}</p>` : "";
  const address = emailPhysicalAddress();
  const unsubscribe = "{{{RESEND_UNSUBSCRIBE_URL}}}";
  const text = [
    "Hi {{{contact.first_name|there}}},",
    "",
    `${call.title} is coming up.`,
    when,
    call.focusTopic ? `Focus: ${call.focusTopic}` : null,
    call.description,
    "",
    `Open the live-call page: ${callsUrl}`,
    call.meetingUrl ? `Join link: ${call.meetingUrl}` : null,
    `Add to Google Calendar: ${calendarUrl}`,
    "",
    `Manage live-call email preferences: ${unsubscribe}`,
    address,
  ].filter((value): value is string => Boolean(value)).join("\n");

  return {
    subject: `Live session reminder: ${call.title}`,
    text,
    html: emailDocument({
      preview: `${call.title} · ${when}`,
      heading: "Your next live session",
      body: [
        `<p style="${paragraphStyle}">Hi {{{contact.first_name|there}}},</p>`,
        `<h2 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0b2a5b;">${escapeHtml(call.title)}</h2>`,
        `<p style="${detailStyle}"><strong>When:</strong> ${escapeHtml(when)}</p>`,
        focus,
        description,
      ].join(""),
      action: { label: call.meetingUrl ? "Join live session" : "View live-call details", url: destination },
      footer: [
        `<p style="${smallStyle}"><a href="${escapeHtml(calendarUrl)}" style="color:#2b8fe0;">Add to Google Calendar</a></p>`,
        `<p style="${smallStyle}">This service reminder was sent to active 1500 Blueprint student accounts.</p>`,
        `<p style="${smallStyle}"><a href="${unsubscribe}" style="color:#2b8fe0;">Manage live-call email preferences</a></p>`,
        address ? `<p style="${smallStyle}">${escapeHtml(address)}</p>` : "",
      ].join(""),
    }),
  };
}

function emailDocument(input: {
  preview: string;
  heading: string;
  body: string;
  action?: { label: string; url: string };
  footer: string;
}): string {
  const action = input.action
    ? `<a href="${escapeHtml(input.action.url)}" style="display:inline-block;box-sizing:border-box;background:#3fa9f5;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:11px;">${escapeHtml(input.action.label)}</a>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#eef2f7;font-family:'Segoe UI',Arial,sans-serif;"><span style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preview)}</span><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef2f7;"><tr><td align="center" style="padding:24px 16px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:#ffffff;border:1px solid #dce3ec;border-radius:16px;"><tr><td style="padding:28px 32px;background:#0b2a5b;border-radius:16px 16px 0 0;color:#ffffff;"><strong style="font-size:20px;line-height:1;">1500 <span style="color:#7ccbff;">Blueprint</span></strong></td></tr><tr><td style="padding:32px;color:#1a233e;"><h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0b2a5b;">${escapeHtml(input.heading)}</h1>${input.body}<div style="margin-top:24px;">${action}</div></td></tr><tr><td style="padding:18px 32px;border-top:1px solid #e7ebf0;background:#f8fafc;border-radius:0 0 16px 16px;">${input.footer}<p style="${smallStyle}">1500 Blueprint · Not affiliated with the College Board.</p></td></tr></table></td></tr></table></body></html>`;
}

function formatCallDateTime(startsAt: string, endsAt: string, timeZone: string): string {
  const date = new Date(startsAt).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
  const start = new Date(startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  const end = new Date(endsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" });
  return `${date}, ${start}–${end}`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const paragraphStyle = "margin:0 0 18px;font-size:16px;line-height:1.6;color:#41506b;";
const detailStyle = "margin:0 0 10px;font-size:15px;line-height:1.5;color:#41506b;";
const smallStyle = "margin:0 0 8px;font-size:12px;line-height:1.5;color:#7b8496;";
