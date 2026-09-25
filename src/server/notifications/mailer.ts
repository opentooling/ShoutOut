import nodemailer from "nodemailer";
import { rootCode } from "../auth/diagnostics";
import type { EmailConfig } from "./email-config";
import type { EmailContent } from "./templates";

export interface Mailer {
  send(to: string, content: EmailContent): Promise<void>;
  /** Connects and signs in to the SMTP server without sending anything. */
  verify(): Promise<void>;
}

/** Nodemailer's TLS switches for a mode. */
export function tlsOptions({ tls, port }: Pick<EmailConfig, "tls" | "port">) {
  return {
    secure: tls === "tls" || (tls === "auto" && port === 465),
    requireTLS: tls === "starttls",
    ignoreTLS: tls === "none",
  };
}

export function createSmtpMailer(config: EmailConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    ...tlsOptions(config),
    name: config.ehloName,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    // Reuse connections when a batch (e.g. the budget reminders) goes out.
    pool: true,
    maxConnections: 2,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    // Messages are built from our own templates; never read files or URLs.
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async send(to, content) {
      await transport.sendMail({ from: config.from, to, ...content });
    },
    async verify() {
      await transport.verify();
    },
  };
}

const TLS_MESSAGE = /certificate|self[- ]signed/i;

/** A likely fix for an SMTP error, for the logs. */
export function smtpHint(error: unknown): string | undefined {
  const code = rootCode(error) ?? "";
  const message = error instanceof Error ? error.message : String(error);
  if (code === "EAUTH") {
    return "The SMTP server rejected the sign-in; check SMTP_USER and the smtp-password secret, or leave both empty for a relay that needs no sign-in.";
  }
  if (/wrong version number|ssl3_get_record|packet length too long/i.test(message)) {
    return "TLS mode mismatch: port 465 expects SMTP_TLS=tls (or auto); ports 25 and 587 expect auto or starttls (Helm: notifications.email.smtp.tls).";
  }
  if (TLS_MESSAGE.test(message) || code.includes("CERT")) {
    return "The SMTP relay's TLS certificate isn't trusted. If it comes from a company CA, mount the CA bundle and set NODE_EXTRA_CA_CERTS (Helm: app.extraCaCerts). As a last resort for an internal relay, SMTP_TLS=none skips STARTTLS.";
  }
  if (code === "EDNS" || code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return "The SMTP host name doesn't resolve from inside the cluster; check SMTP_HOST and cluster DNS.";
  }
  if (["ECONNECTION", "ECONNREFUSED", "ETIMEDOUT", "ESOCKET", "ECONNRESET"].includes(code)) {
    return "The SMTP server isn't reachable from the app pod; check SMTP_HOST, SMTP_PORT, network policies and firewalls.";
  }
  if (code === "EENVELOPE" || /relay|not permitted|access denied/i.test(message)) {
    return "The relay refused the message. Relays usually accept mail only from allowed networks and senders: ask the mail team to allow the cluster's outgoing IP addresses and the SMTP_FROM address.";
  }
  return undefined;
}
