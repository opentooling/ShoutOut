import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import { createLogger, type LogFields } from "@/lib/logger";
import type { Mailer } from "./mailer";
import { retryDelayMs, startEmailNotifications } from "./worker";

const relay = {
  SMTP_HOST: "relay.example.com",
  SMTP_FROM: "shoutout@example.com",
  SMTP_USER: "svc",
};

function memoryLog() {
  const lines: { level: string; msg: string; fields: LogFields }[] = [];
  const sink = {
    out: (line: string) => lines.push(JSON.parse(line)),
    err: (line: string) => lines.push(JSON.parse(line)),
  };
  const log = createLogger("notifications", { env: { LOG_LEVEL: "debug" }, sink });
  const find = (msg: string) => lines.find((line) => line.msg === msg) as LogFields | undefined;
  return { log, lines, find };
}

/** A database with an empty queue. */
function emptyDb() {
  const db = {
    execute: vi.fn().mockResolvedValue(0),
    rows: vi.fn().mockResolvedValue([]),
    transaction: vi.fn((work: (tx: Db) => unknown) => work(db as unknown as Db)),
  };
  return db;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("retryDelayMs", () => {
  it("doubles from a minute up to an hour", () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(240_000);
    expect(retryDelayMs(7)).toBe(3_600_000);
  });
});

describe("startEmailNotifications", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays off without SMTP_HOST", async () => {
    const { log, find } = memoryLog();
    expect(await startEmailNotifications({ env: {}, log })).toBeNull();
    expect(find("Email notifications are off")).toMatchObject({ reason: "SMTP_HOST is not set" });
  });

  it("stays off and says why when a setting is invalid", async () => {
    const { log, find } = memoryLog();
    expect(await startEmailNotifications({ env: { SMTP_HOST: "relay" }, log })).toBeNull();
    expect(find("Email notifications are off: invalid settings")).toMatchObject({
      level: "error",
      error: { message: "SMTP_FROM must be set when SMTP_HOST is set" },
    });
  });

  it("logs the settings and the relay check, then sends on a timer", async () => {
    vi.useFakeTimers();
    const { log, find } = memoryLog();
    const db = emptyDb();
    const mailer: Mailer = { send: vi.fn(), verify: vi.fn().mockResolvedValue(undefined) };
    const stop = await startEmailNotifications({
      env: { ...relay, SMTP_PASSWORD: "secret-pw" },
      log,
      db: () => db as unknown as Db,
      mailer: () => mailer,
      intervalMs: 1000,
      housekeepingMs: 5000,
    });
    expect(stop).toBeTypeOf("function");
    expect(find("Email notifications are on")).toMatchObject({
      host: "relay.example.com",
      port: 25,
      tls: "auto",
      smtpUser: "svc",
      ehloName: null,
      from: "shoutout@example.com",
      delaySeconds: 120,
      reminderDaysBeforeReset: 14,
    });
    expect(JSON.stringify(find("Email notifications are on"))).not.toContain("secret-pw");
    expect(find("SMTP server accepted the connection")).toBeDefined();

    // The first run does housekeeping (reminders + cleanup) and checks the queue.
    await vi.advanceTimersByTimeAsync(0);
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    // The next run only checks the queue; housekeeping waits for its own interval.
    await vi.advanceTimersByTimeAsync(1000);
    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(db.execute).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(db.execute).toHaveBeenCalledTimes(4);

    stop!();
    const runs = db.transaction.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(db.transaction).toHaveBeenCalledTimes(runs);
  });

  it("keeps going when the relay can't be reached, and logs failed runs", async () => {
    const { log, find } = memoryLog();
    const db = emptyDb();
    db.transaction.mockRejectedValue(new Error("database down"));
    const refused = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNECTION" });
    const mailer: Mailer = { send: vi.fn(), verify: vi.fn().mockRejectedValue(refused) };
    const stop = await startEmailNotifications({
      env: { ...relay, SMTP_USER: "", SMTP_EHLO_NAME: "shoutout.example.com" },
      log,
      db: () => db as unknown as Db,
      mailer: () => mailer,
    });
    expect(find("Email notifications are on")).toMatchObject({
      smtpUser: null,
      ehloName: "shoutout.example.com",
    });
    expect(
      find("Could not connect to the SMTP server; emails wait in the queue and are retried"),
    ).toMatchObject({ level: "warn", hint: expect.stringMatching(/isn't reachable/) });
    await flush();
    expect(find("Email sender run failed")).toMatchObject({
      level: "error",
      error: { message: "database down" },
    });
    stop!();
  });

  it("doesn't start a run while the previous one is still going", async () => {
    vi.useFakeTimers();
    const { log } = memoryLog();
    const db = emptyDb();
    let finish: () => void = () => {};
    db.transaction.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    const mailer: Mailer = { send: vi.fn(), verify: vi.fn().mockResolvedValue(undefined) };
    const stop = await startEmailNotifications({
      env: relay,
      log,
      db: () => db as unknown as Db,
      mailer: () => mailer,
      intervalMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(db.transaction).toHaveBeenCalledTimes(2);
    stop!();
  });
});
