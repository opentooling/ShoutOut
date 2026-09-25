import type { CardTone } from "@/components/cards/designs";
import { formatDayCount, formatDayMonth } from "@/lib/format";
import type { Visibility } from "../types";

/**
 * Email content: a subject, a plain-text body and a simple HTML body with
 * inline styles (mail clients ignore stylesheets). Everything that comes from
 * people is escaped.
 */

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface ShoutoutEmail {
  shoutoutId: string;
  recipientId: string;
  recipientName: string;
  senderName: string;
  cardTitle: string;
  cardTagline: string;
  cardTone: CardTone;
  valueName: string;
  message: string;
  visibility: Visibility;
  /** Other people thanked in the same shoutout. */
  otherRecipients: number;
}

export interface BudgetReminderEmail {
  recipientId: string;
  recipientName: string;
  remaining: number;
  allowance: number;
  resetsAt: Date;
  reminderDays: number;
}

// The light theme's colours (globals.css): soft background and strong text per tone.
const TONES: Record<CardTone, { soft: string; strong: string }> = {
  coral: { soft: "#ffe1dc", strong: "#d9503f" },
  lilac: { soft: "#ebe7ff", strong: "#6c5bd4" },
  teal: { soft: "#d3f0ed", strong: "#1d7a76" },
  sunny: { soft: "#ffe8b0", strong: "#8a5a00" },
  sky: { soft: "#ddeffd", strong: "#2a7fbf" },
  leaf: { soft: "#def3df", strong: "#3a8a40" },
};

const INK = "#2b2a33";
const MUTED = "#6b6875";
const TEAL = "#1d7a76";
const FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function settingsUrl(appUrl: string, userId: string) {
  return `${appUrl}/people/${encodeURIComponent(userId)}#email-settings`;
}

function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${TEAL};color:#ffffff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px">${escapeHtml(label)}</a>`;
}

/** The shared frame: brand line, the body, and a footer on how to turn emails off. */
function layout(body: string, footer: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:0;background:#fbf7f0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf7f0">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;border:2px solid #ece6db">
<tr><td style="padding:28px 28px 8px;font-family:${FONT};color:${INK};font-size:16px;line-height:1.5">
<p style="margin:0 0 20px;font-size:20px;font-weight:800;color:${TEAL}">ShoutOut</p>
${body}
</td></tr>
<tr><td style="padding:16px 28px 28px;font-family:${FONT};color:${MUTED};font-size:12px;line-height:1.5">${footer}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function footer(appUrl: string, userId: string, what: string) {
  const url = settingsUrl(appUrl, userId);
  return {
    html: `You get this email because ${escapeHtml(what)} are on. <a href="${escapeHtml(url)}" style="color:${MUTED}">Change your email settings</a>.`,
    text: `You get this email because ${what} are on. Change your email settings: ${url}`,
  };
}

export function shoutoutReceivedEmail(email: ShoutoutEmail, appUrl: string): EmailContent {
  const url = `${appUrl}/shoutouts/${encodeURIComponent(email.shoutoutId)}`;
  const tone = TONES[email.cardTone];
  const others =
    email.otherRecipients === 0
      ? ""
      : email.otherRecipients === 1
        ? " along with one other person"
        : ` along with ${email.otherRecipients} other people`;
  const lead = `${email.senderName} recognised you${others} for ${email.valueName}.`;
  const privateNote =
    email.visibility === "PRIVATE"
      ? "This shoutout is private: only the sender and the people it thanks can see it."
      : null;
  const foot = footer(appUrl, email.recipientId, "shoutout notifications");

  const text = [
    `Hi ${firstName(email.recipientName)},`,
    lead,
    `${email.cardTitle}: ${email.cardTagline}`,
    `"${email.message}"`,
    ...(privateNote ? [privateNote] : []),
    `See it on ShoutOut: ${url}`,
    "--",
    foot.text,
  ].join("\n\n");

  const html = layout(
    `<p style="margin:0 0 16px">Hi ${escapeHtml(firstName(email.recipientName))},</p>
<p style="margin:0 0 20px"><strong>${escapeHtml(email.senderName)}</strong> recognised you${escapeHtml(others)} for <strong>#${escapeHtml(email.valueName)}</strong>.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${tone.soft};border-radius:16px">
<tr><td style="padding:20px 22px">
<p style="margin:0;font-size:22px;font-weight:800;color:${tone.strong}">${escapeHtml(email.cardTitle)}</p>
<p style="margin:2px 0 14px;font-size:14px;color:${tone.strong}">${escapeHtml(email.cardTagline)}</p>
<p style="margin:0;font-size:17px;white-space:pre-line">${escapeHtml(email.message)}</p>
</td></tr>
</table>
${privateNote ? `<p style="margin:12px 0 0;font-size:13px;color:${MUTED}">🔒 ${escapeHtml(privateNote)}</p>` : ""}
<p style="margin:24px 0 8px">${button(url, "See it on ShoutOut")}</p>`,
    foot.html,
  );

  return {
    subject: `${email.senderName} sent you a shoutout for ${email.valueName} 🎉`,
    text,
    html,
  };
}

export function budgetReminderEmail(email: BudgetReminderEmail, appUrl: string): EmailContent {
  const url = `${appUrl}/shoutouts/new`;
  const left = plural(email.remaining, "shoutout");
  // resetsAt is the first moment of the next quarter; the last usable day is the day before.
  const lastDay = formatDayMonth(new Date(email.resetsAt.getTime() - 1));
  const when = formatDayCount(email.reminderDays);
  const foot = footer(appUrl, email.recipientId, "budget reminders");
  const lines = [
    `Your ShoutOut budget resets in about ${when}. You still have ${email.remaining} of your ${email.allowance} shoutouts to give, and unused ones don't carry over: the last day to use them is ${lastDay}.`,
    "Who made a difference for you this quarter? Think beyond your own team: someone who answered a question, unblocked you, or quietly made things better.",
  ];

  const text = [
    `Hi ${firstName(email.recipientName)},`,
    ...lines,
    `Send a shoutout: ${url}`,
    "--",
    foot.text,
  ].join("\n\n");

  const html = layout(
    `<p style="margin:0 0 16px">Hi ${escapeHtml(firstName(email.recipientName))},</p>
<p style="margin:0 0 16px">Your ShoutOut budget resets in about ${escapeHtml(when)}. You still have <strong>${email.remaining} of your ${email.allowance} shoutouts</strong> to give, and unused ones don't carry over: the last day to use them is <strong>${escapeHtml(lastDay)}</strong>.</p>
<p style="margin:0 0 16px">${escapeHtml(lines[1])}</p>
<p style="margin:24px 0 8px">${button(url, "Send a shoutout")}</p>`,
    foot.html,
  );

  return {
    subject: `You have ${left} left this quarter`,
    text,
    html,
  };
}
