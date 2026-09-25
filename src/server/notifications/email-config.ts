/**
 * Email notification settings, from the environment. Emails go out through an
 * SMTP relay; email is on when SMTP_HOST is set. Everything else has a sensible
 * default except the sender address. SMTP_USER/SMTP_PASSWORD are only for relays
 * that need a sign-in; most internal relays accept mail from allowed networks.
 */

type Env = Record<string, string | undefined>;

export interface EmailConfig {
  host: string;
  port: number;
  /** How the connection to the relay is encrypted; see SMTP_TLS_MODES. */
  tls: SmtpTlsMode;
  user?: string;
  password?: string;
  /** Host name to greet the relay with (EHLO); defaults to the pod's host name. */
  ehloName?: string;
  /** Sender, e.g. "ShoutOut <shoutout@example.com>". */
  from: string;
  /** Public URL of the app, for links in emails. */
  appUrl: string;
  /** Wait before telling someone about a shoutout, so quick edits and deletes are picked up. */
  delayMs: number;
  /** Days before the quarterly budget resets to send the reminder; 0 turns it off. */
  reminderDays: number;
}

/**
 * - auto: TLS from the start on port 465, otherwise STARTTLS when the relay offers it
 * - starttls: STARTTLS is required; fail if the relay doesn't offer it
 * - tls: TLS from the start (implicit TLS, usually port 465)
 * - none: plain SMTP, never STARTTLS (internal relays whose certificate can't be verified)
 */
export const SMTP_TLS_MODES = ["auto", "starttls", "tls", "none"] as const;
export type SmtpTlsMode = (typeof SMTP_TLS_MODES)[number];

export const DEFAULT_SMTP_PORT = 25;
export const DEFAULT_DELAY_SECONDS = 120;
export const DEFAULT_REMINDER_DAYS = 14;

function wholeNumber(raw: string | undefined, name: string, fallback: number, max: number) {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`${name} must be a whole number from 0 to ${max}, got "${raw}"`);
  }
  return value;
}

function tlsMode(raw: string | undefined): SmtpTlsMode {
  const value = raw?.trim().toLowerCase();
  if (!value) return "auto";
  if (!(SMTP_TLS_MODES as readonly string[]).includes(value)) {
    throw new Error(`SMTP_TLS must be one of ${SMTP_TLS_MODES.join(", ")}, got "${raw}"`);
  }
  return value as SmtpTlsMode;
}

function delayMs(env: Env): number {
  const seconds = wholeNumber(
    env.SHOUTOUT_EMAIL_DELAY_SECONDS,
    "SHOUTOUT_EMAIL_DELAY_SECONDS",
    DEFAULT_DELAY_SECONDS,
    86_400,
  );
  return seconds * 1000;
}

export function emailEnabled(env: Env = process.env): boolean {
  return Boolean(env.SMTP_HOST?.trim());
}

/** Null when email is off. Throws with a readable message when a setting is invalid. */
export function emailConfigFromEnv(env: Env = process.env): EmailConfig | null {
  if (!emailEnabled(env)) return null;
  const from = env.SMTP_FROM?.trim();
  if (!from) throw new Error("SMTP_FROM must be set when SMTP_HOST is set");
  return {
    host: env.SMTP_HOST!.trim(),
    port: wholeNumber(env.SMTP_PORT, "SMTP_PORT", DEFAULT_SMTP_PORT, 65_535),
    tls: tlsMode(env.SMTP_TLS),
    user: env.SMTP_USER?.trim() || undefined,
    password: env.SMTP_PASSWORD || undefined,
    ehloName: env.SMTP_EHLO_NAME?.trim() || undefined,
    from,
    appUrl: (env.AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
    delayMs: delayMs(env),
    reminderDays: wholeNumber(
      env.SHOUTOUT_BUDGET_REMINDER_DAYS,
      "SHOUTOUT_BUDGET_REMINDER_DAYS",
      DEFAULT_REMINDER_DAYS,
      60,
    ),
  };
}

/**
 * The settings, or null when email is off or its settings are invalid (the
 * sender logs why at startup). Never throws, so a bad mail setting can't break
 * pages or stop anyone sending a shoutout.
 */
export function activeEmailConfig(env: Env = process.env): EmailConfig | null {
  try {
    return emailConfigFromEnv(env);
  } catch {
    return null;
  }
}

/** How long to hold a new shoutout's emails, or null when nothing should be queued. */
export function shoutoutEmailDelayMs(env: Env = process.env): number | null {
  return activeEmailConfig(env)?.delayMs ?? null;
}
