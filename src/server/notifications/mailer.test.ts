import { describe, expect, it, vi } from "vitest";
import type { EmailConfig } from "./email-config";

const sendMail = vi.fn();
const verify = vi.fn();
const createTransport = vi.fn(() => ({ sendMail, verify }));
vi.mock("nodemailer", () => ({ default: { createTransport } }));

const { createSmtpMailer, smtpHint, tlsOptions } = await import("./mailer");

const config: EmailConfig = {
  host: "relay.example.com",
  port: 25,
  tls: "auto",
  from: "ShoutOut <shoutout@example.com>",
  appUrl: "https://shoutout.example.com",
  delayMs: 0,
  reminderDays: 14,
};

describe("createSmtpMailer", () => {
  it("sends through the relay without signing in by default", async () => {
    const mailer = createSmtpMailer(config);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "relay.example.com",
        port: 25,
        secure: false,
        requireTLS: false,
        ignoreTLS: false,
        auth: undefined,
        name: undefined,
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    );
    await mailer.send("carol@example.com", { subject: "Hi", text: "t", html: "<p>h</p>" });
    expect(sendMail).toHaveBeenCalledWith({
      from: "ShoutOut <shoutout@example.com>",
      to: "carol@example.com",
      subject: "Hi",
      text: "t",
      html: "<p>h</p>",
    });
    await mailer.verify();
    expect(verify).toHaveBeenCalledOnce();
  });

  it("signs in and greets with a set name when configured", () => {
    createSmtpMailer({ ...config, user: "svc", password: "pw", ehloName: "shoutout.example.com" });
    expect(createTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        auth: { user: "svc", pass: "pw" },
        name: "shoutout.example.com",
      }),
    );
  });
});

describe("tlsOptions", () => {
  it("maps each mode to nodemailer's switches", () => {
    expect(tlsOptions({ tls: "auto", port: 465 })).toEqual({
      secure: true,
      requireTLS: false,
      ignoreTLS: false,
    });
    expect(tlsOptions({ tls: "auto", port: 587 }).secure).toBe(false);
    expect(tlsOptions({ tls: "tls", port: 2525 }).secure).toBe(true);
    expect(tlsOptions({ tls: "starttls", port: 587 })).toEqual({
      secure: false,
      requireTLS: true,
      ignoreTLS: false,
    });
    expect(tlsOptions({ tls: "none", port: 25 })).toEqual({
      secure: false,
      requireTLS: false,
      ignoreTLS: true,
    });
  });
});

describe("smtpHint", () => {
  const error = (message: string, code?: string) => Object.assign(new Error(message), { code });

  it("explains common relay problems", () => {
    expect(smtpHint(error("Invalid login", "EAUTH"))).toMatch(/rejected the sign-in/);
    expect(smtpHint(error("ssl3_get_record:wrong version number", "ESOCKET"))).toMatch(
      /TLS mode mismatch/,
    );
    expect(smtpHint(error("self-signed certificate in certificate chain", "ESOCKET"))).toMatch(
      /certificate isn't trusted/,
    );
    expect(
      smtpHint(new Error("x", { cause: error("y", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY") })),
    ).toMatch(/certificate isn't trusted/);
    expect(smtpHint(error("getaddrinfo ENOTFOUND relay", "EDNS"))).toMatch(/doesn't resolve/);
    expect(smtpHint(error("connect ECONNREFUSED", "ECONNECTION"))).toMatch(/isn't reachable/);
    expect(smtpHint(error("Can't send mail - all recipients were rejected", "EENVELOPE"))).toMatch(
      /refused the message/,
    );
    expect(smtpHint(error("554 5.7.1 Relay access denied", "EMESSAGE"))).toMatch(
      /allowed networks/,
    );
    expect(smtpHint(error("something else", "EOTHER"))).toBeUndefined();
    expect(smtpHint("plain string")).toBeUndefined();
  });
});
