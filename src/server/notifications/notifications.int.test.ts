import { describe, expect, it, vi } from "vitest";
import { createLogger, type LogFields } from "@/lib/logger";
import { sql } from "@/lib/sql";
import { useTestDb } from "../../../test/db";
import { CARD_ID, createUser, setUserActive, VALUE_ID } from "../../../test/factories";
import { deleteShoutout } from "../shoutouts/manage";
import { sendShoutout } from "../shoutouts/send";
import type { EmailConfig } from "./email-config";
import type { Mailer } from "./mailer";
import { enqueueBudgetReminders, purgeFinished, reminderStart } from "./outbox";
import { getEmailPreferences, setEmailPreferences } from "./preferences";
import type { EmailContent } from "./templates";
import { deliverBatch, MAX_ATTEMPTS, runSender, type SenderDeps } from "./worker";

const now = new Date("2026-09-17T12:00:00Z");
const MINUTE = 60_000;
const at = (ms: number) => new Date(now.getTime() + ms);

const config: EmailConfig = {
  host: "relay.example.com",
  port: 25,
  tls: "auto",
  from: "ShoutOut <shoutout@example.com>",
  appUrl: "https://shoutout.example.com",
  delayMs: 2 * MINUTE,
  reminderDays: 14,
};

interface Outbox {
  kind: string;
  userId: string;
  status: string;
  attempts: number;
  sendAfter: Date;
  lastError: string | null;
}

describe("email notifications (postgres)", () => {
  const db = useTestDb();

  function setup(mailer: Partial<Mailer> = {}) {
    const sent: { to: string; content: EmailContent }[] = [];
    const logs: LogFields[] = [];
    const sink = {
      out: (l: string) => logs.push(JSON.parse(l)),
      err: (l: string) => logs.push(JSON.parse(l)),
    };
    const deps: SenderDeps = {
      db,
      config,
      allowance: 5,
      mailer: {
        send: vi.fn(async (to: string, content: EmailContent) => {
          sent.push({ to, content });
        }),
        verify: vi.fn(),
        ...mailer,
      },
      log: createLogger("notifications", { env: { LOG_LEVEL: "debug" }, sink }),
    };
    return { deps, sent, logs };
  }

  async function people() {
    const [alice, bob, carol] = await Promise.all(
      ["Alice Andrews", "Bob Baker", "Carol Chen"].map((name) => createUser(db, { name })),
    );
    return { alice, bob, carol };
  }

  function send(
    senderId: string,
    recipientIds: string[],
    emailDelayMs: number | null = 2 * MINUTE,
  ) {
    return sendShoutout(
      db,
      senderId,
      {
        recipientIds,
        cardId: CARD_ID,
        valueId: VALUE_ID,
        message: "You <3 saved the demo",
        visibility: "PUBLIC",
      },
      { quarterlyBudget: 5, emailDelayMs },
      now,
    );
  }

  const outbox = () =>
    db.rows<Outbox>(sql`
      SELECT kind, user_id AS "userId", status, attempts, send_after AS "sendAfter", last_error AS "lastError"
      FROM notification_outbox ORDER BY created_at, user_id`);

  describe("shoutout emails", () => {
    it("queues one per recipient when a shoutout is sent, and none when email is off", async () => {
      const { alice, bob, carol } = await people();
      await send(alice.id, [bob.id, carol.id]);
      await send(bob.id, [carol.id], null);
      const rows = await outbox();
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.userId).sort()).toEqual([bob.id, carol.id].sort());
      expect(rows[0]).toMatchObject({
        kind: "SHOUTOUT_RECEIVED",
        status: "PENDING",
        sendAfter: at(2 * MINUTE),
      });
    });

    it("sends once the delay has passed, with the current content", async () => {
      const { alice, bob, carol } = await people();
      await send(alice.id, [bob.id, carol.id]);
      const { deps, sent, logs } = setup();

      expect(await deliverBatch(deps, at(MINUTE))).toMatchObject({ sent: 0, full: false });
      expect(await deliverBatch(deps, at(2 * MINUTE))).toEqual({
        sent: 2,
        skipped: 0,
        failed: 0,
        full: false,
      });

      const toBob = sent.find((email) => email.to === bob.email)!;
      expect(toBob.content.subject).toBe("Alice Andrews sent you a shoutout for Integrity 🎉");
      expect(toBob.content.text).toContain("recognised you along with one other person");
      expect(toBob.content.text).toContain("Thank You: For being awesome");
      expect(toBob.content.html).toContain("You &lt;3 saved the demo");
      expect((await outbox()).every((row) => row.status === "SENT" && row.attempts === 1)).toBe(
        true,
      );
      expect(logs.filter((l) => l.msg === "Email sent")).toHaveLength(2);
      // Nothing is sent twice.
      expect((await deliverBatch(deps, at(10 * MINUTE))).sent).toBe(0);
    });

    it("skips emails that no longer apply", async () => {
      const { alice, bob, carol } = await people();
      const deleted = await send(alice.id, [carol.id]);
      await deleteShoutout(db, alice.id, deleted.id, at(MINUTE));
      const hidden = await send(alice.id, [carol.id]);
      await db.execute(
        sql`UPDATE shoutouts SET moderation_status = 'HIDDEN' WHERE id = ${hidden.id}`,
      );
      await send(carol.id, [alice.id, bob.id]);
      await setUserActive(db, alice.id, false);
      await setEmailPreferences(db, bob.id, { onShoutout: false, budgetReminder: true });

      const { deps, sent, logs } = setup();
      expect(await deliverBatch(deps, at(5 * MINUTE))).toMatchObject({ sent: 0, skipped: 4 });
      expect(sent).toEqual([]);
      const reasons = (await outbox()).map((row) => row.lastError).sort();
      expect(reasons).toEqual([
        "person is no longer active",
        "shoutout is hidden",
        "shoutout was deleted",
        "turned off shoutout emails",
      ]);
      expect((await outbox()).every((row) => row.status === "SKIPPED")).toBe(true);
      expect(logs.find((l) => l.msg === "Email skipped")).toMatchObject({ level: "debug" });
    });

    it("retries failures with backoff, then gives up", async () => {
      const { alice, bob } = await people();
      await send(alice.id, [bob.id]);
      const refused = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNECTION" });
      const { deps, logs } = setup({ send: vi.fn().mockRejectedValue(refused) });

      expect(await deliverBatch(deps, at(2 * MINUTE))).toMatchObject({ failed: 1 });
      let [row] = await outbox();
      expect(row).toMatchObject({
        status: "PENDING",
        attempts: 1,
        lastError: "connect ECONNREFUSED",
        sendAfter: at(3 * MINUTE),
      });
      expect(logs.find((l) => l.msg === "Email failed; will retry")).toMatchObject({
        level: "warn",
        attempt: 1,
        hint: expect.stringMatching(/isn't reachable/),
      });

      await db.execute(sql`UPDATE notification_outbox SET attempts = ${MAX_ATTEMPTS - 1}`);
      vi.mocked(deps.mailer.send).mockRejectedValue("421 try again later");
      await deliverBatch(deps, at(10 * MINUTE));
      [row] = await outbox();
      expect(row).toMatchObject({
        status: "FAILED",
        attempts: MAX_ATTEMPTS,
        lastError: "421 try again later",
      });
      expect(logs.find((l) => l.msg === "Email failed; giving up")).toMatchObject({
        level: "error",
      });
    });

    it("lets several senders share the queue without sending anything twice", async () => {
      const { alice, bob, carol } = await people();
      await send(alice.id, [bob.id, carol.id]);
      const { deps, sent } = setup();
      const slow = deps.mailer.send as ReturnType<typeof vi.fn>;
      slow.mockImplementation(async (to: string, content: EmailContent) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        sent.push({ to, content });
      });
      const results = await Promise.all([
        deliverBatch(deps, at(5 * MINUTE), 1),
        deliverBatch(deps, at(5 * MINUTE), 1),
      ]);
      expect(results.map((r) => r.sent)).toEqual([1, 1]);
      expect(sent.map((email) => email.to).sort()).toEqual([bob.email, carol.email].sort());
    });
  });

  describe("budget reminders", () => {
    it("starts at 08:00 UTC the set number of days before the reset", () => {
      expect(reminderStart(now, 14)).toEqual(new Date("2026-09-17T08:00:00Z"));
      expect(reminderStart(now, 0)).toBeNull();
    });

    it("queues one per person and quarter once the window opens", async () => {
      const { alice, bob, carol } = await people();
      await setUserActive(db, carol.id, false);
      await setEmailPreferences(db, bob.id, { onShoutout: true, budgetReminder: false });

      expect(await enqueueBudgetReminders(db, new Date("2026-09-17T07:59:00Z"), 14)).toBe(0);
      expect(await enqueueBudgetReminders(db, now, 0)).toBe(0);
      expect(await enqueueBudgetReminders(db, now, 14)).toBe(1);
      expect(await enqueueBudgetReminders(db, at(60 * MINUTE), 14)).toBe(0);
      expect(await outbox()).toEqual([
        expect.objectContaining({ kind: "BUDGET_REMINDER", userId: alice.id, status: "PENDING" }),
      ]);
    });

    it("sends what is left, and skips people who have nothing left or turned it off", async () => {
      const { alice, bob, carol } = await people();
      await send(alice.id, [bob.id, carol.id], null); // Alice has 3 of 5 left
      for (let i = 0; i < 5; i++) await send(bob.id, [carol.id], null); // Bob has none left
      expect(await enqueueBudgetReminders(db, now, 14)).toBe(3);
      // Carol turns reminders off after hers was queued: settings are checked when it goes out.
      await setEmailPreferences(db, carol.id, { onShoutout: true, budgetReminder: false });
      const { deps, sent } = setup();

      expect(await runSender(deps, { now: () => now })).toEqual({ sent: 1, skipped: 2, failed: 0 });
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe(alice.email);
      expect(sent[0].content.subject).toBe("You have 3 shoutouts left this quarter");
      expect(sent[0].content.text).toContain("the last day to use them is 30 Sep");
      const reasons = (await outbox())
        .map((row) => row.lastError)
        .filter(Boolean)
        .sort();
      expect(reasons).toEqual(["budget already used", "turned off budget reminders"]);
    });

    it("queues and sends reminders as part of a sender run", async () => {
      await people();
      const { deps, sent, logs } = setup();
      expect(await runSender(deps, { now: () => now })).toEqual({ sent: 3, skipped: 0, failed: 0 });
      expect(logs.find((l) => l.msg === "Budget reminders queued")).toMatchObject({ count: 3 });
      expect(sent[0].content.subject).toBe("You have 5 shoutouts left this quarter");
      await runSender(deps, { now: () => at(MINUTE) });
      expect(logs.filter((l) => l.msg === "Budget reminders queued")).toHaveLength(1);
    });

    it("drops a reminder still waiting when its quarter is over", async () => {
      await people();
      expect(await enqueueBudgetReminders(db, now, 14)).toBe(3);
      const { deps, sent } = setup();
      await runSender(deps, { now: () => new Date("2026-10-01T09:00:00Z"), housekeeping: false });
      expect(sent).toEqual([]);
      const rows = await outbox();
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row).toMatchObject({ status: "SKIPPED", lastError: "the quarter has ended" });
      }
    });
  });

  describe("runSender", () => {
    it("works through the queue in batches", async () => {
      const { alice, bob, carol } = await people();
      await send(alice.id, [bob.id, carol.id]);
      await send(bob.id, [alice.id]);
      const { deps, sent } = setup();
      const result = await runSender(deps, {
        now: () => at(5 * MINUTE),
        housekeeping: false,
        batchSize: 1,
      });
      expect(result).toEqual({ sent: 3, skipped: 0, failed: 0 });
      expect(sent).toHaveLength(3);
    });
  });

  it("removes finished notifications after they are old, keeping pending ones", async () => {
    const { alice, bob, carol } = await people();
    await send(alice.id, [bob.id, carol.id]);
    await db.execute(sql`UPDATE notification_outbox SET status = 'SENT' WHERE user_id = ${bob.id}`);
    expect(await purgeFinished(db, new Date(Date.now() - MINUTE))).toBe(0);
    expect(await purgeFinished(db, new Date(Date.now() + MINUTE))).toBe(1);
    expect((await outbox()).map((row) => row.userId)).toEqual([carol.id]);
  });

  it("stores email settings, on by default", async () => {
    const { alice } = await people();
    expect(await getEmailPreferences(db, alice.id)).toEqual({
      onShoutout: true,
      budgetReminder: true,
    });
    await setEmailPreferences(db, alice.id, { onShoutout: false, budgetReminder: true });
    expect(await getEmailPreferences(db, alice.id)).toEqual({
      onShoutout: false,
      budgetReminder: true,
    });
    expect(await getEmailPreferences(db, "nobody")).toEqual({
      onShoutout: true,
      budgetReminder: true,
    });
  });
});
