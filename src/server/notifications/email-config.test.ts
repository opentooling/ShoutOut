import { describe, expect, it } from "vitest";
import {
  activeEmailConfig,
  emailConfigFromEnv,
  emailEnabled,
  shoutoutEmailDelayMs,
} from "./email-config";

const relay = { SMTP_HOST: " relay.example.com ", SMTP_FROM: "ShoutOut <shoutout@example.com>" };

describe("emailConfigFromEnv", () => {
  it("is off without SMTP_HOST", () => {
    expect(emailEnabled({})).toBe(false);
    expect(emailEnabled({ SMTP_HOST: "  " })).toBe(false);
    expect(emailConfigFromEnv({})).toBeNull();
  });

  it("defaults to a relay on port 25 with no sign-in", () => {
    expect(emailConfigFromEnv(relay)).toEqual({
      host: "relay.example.com",
      port: 25,
      tls: "auto",
      user: undefined,
      password: undefined,
      ehloName: undefined,
      from: "ShoutOut <shoutout@example.com>",
      appUrl: "http://localhost:3000",
      delayMs: 120_000,
      reminderDays: 14,
    });
  });

  it("reads every setting", () => {
    expect(
      emailConfigFromEnv({
        ...relay,
        SMTP_PORT: "587",
        SMTP_TLS: " STARTTLS ",
        SMTP_USER: " svc-shoutout ",
        SMTP_PASSWORD: "pw",
        SMTP_EHLO_NAME: " shoutout.example.com ",
        AUTH_URL: "https://shoutout.example.com//",
        SHOUTOUT_EMAIL_DELAY_SECONDS: "0",
        SHOUTOUT_BUDGET_REMINDER_DAYS: "0",
      }),
    ).toEqual({
      host: "relay.example.com",
      port: 587,
      tls: "starttls",
      user: "svc-shoutout",
      password: "pw",
      ehloName: "shoutout.example.com",
      from: "ShoutOut <shoutout@example.com>",
      appUrl: "https://shoutout.example.com",
      delayMs: 0,
      reminderDays: 0,
    });
  });

  it("rejects invalid settings with a readable message", () => {
    expect(() => emailConfigFromEnv({ SMTP_HOST: "relay" })).toThrow(
      "SMTP_FROM must be set when SMTP_HOST is set",
    );
    expect(() => emailConfigFromEnv({ ...relay, SMTP_PORT: "70000" })).toThrow(
      'SMTP_PORT must be a whole number from 0 to 65535, got "70000"',
    );
    expect(() => emailConfigFromEnv({ ...relay, SMTP_TLS: "yes" })).toThrow(
      'SMTP_TLS must be one of auto, starttls, tls, none, got "yes"',
    );
    expect(() => emailConfigFromEnv({ ...relay, SHOUTOUT_BUDGET_REMINDER_DAYS: "1.5" })).toThrow(
      "SHOUTOUT_BUDGET_REMINDER_DAYS",
    );
  });
});

describe("activeEmailConfig and shoutoutEmailDelayMs", () => {
  it("never throw: invalid settings mean email is off", () => {
    expect(activeEmailConfig({ SMTP_HOST: "relay" })).toBeNull();
    expect(shoutoutEmailDelayMs({ SMTP_HOST: "relay" })).toBeNull();
    expect(shoutoutEmailDelayMs({})).toBeNull();
    expect(shoutoutEmailDelayMs({ ...relay, SHOUTOUT_EMAIL_DELAY_SECONDS: "5" })).toBe(5000);
    expect(activeEmailConfig(relay)?.host).toBe("relay.example.com");
  });
});
