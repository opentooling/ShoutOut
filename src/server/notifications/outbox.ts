import type { Db } from "@/lib/db";
import { sql } from "@/lib/sql";
import { quarterBounds } from "../shoutouts/quarter";

/**
 * Notifications waiting to be emailed. Rows are written alongside the change
 * that caused them (in the same transaction where there is one) and worked
 * through by the background sender, so a mail outage never loses or slows down
 * anything. Several app replicas can share the queue (FOR UPDATE SKIP LOCKED).
 */

export type NotificationKind = "SHOUTOUT_RECEIVED" | "BUDGET_REMINDER";

export interface OutboxItem {
  id: string;
  kind: NotificationKind;
  userId: string;
  shoutoutId: string | null;
  attempts: number;
  createdAt: Date;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Tells each recipient about their new shoutout once `sendAfter` has passed. */
export async function enqueueShoutoutEmails(
  db: Db,
  shoutoutId: string,
  recipientIds: string[],
  sendAfter: Date,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO notification_outbox (kind, user_id, shoutout_id, dedupe_key, send_after)
    SELECT 'SHOUTOUT_RECEIVED', r.user_id, ${shoutoutId}::text,
      'shoutout:' || ${shoutoutId}::text || ':' || r.user_id, ${sendAfter}::timestamptz
    FROM unnest(${recipientIds}::text[]) AS r(user_id)
    ON CONFLICT (dedupe_key) DO NOTHING`);
}

/**
 * When this quarter's budget reminders go out: `days` before the reset, at
 * 08:00 UTC so they arrive during the working day. Null when reminders are off.
 */
export function reminderStart(now: Date, days: number): Date | null {
  if (days <= 0) return null;
  return new Date(quarterBounds(now).end.getTime() - days * DAY + 8 * HOUR);
}

/**
 * Queues this quarter's budget reminder for everyone active who hasn't turned
 * it off, once the reminder window has started. Safe to call repeatedly: each
 * person gets at most one per quarter, and people who join during the window
 * are picked up on the next call. Returns how many were queued.
 */
export async function enqueueBudgetReminders(db: Db, now: Date, days: number): Promise<number> {
  const start = reminderStart(now, days);
  if (!start || now < start) return 0;
  const quarter = quarterBounds(now).start.toISOString().slice(0, 10);
  return db.execute(sql`
    INSERT INTO notification_outbox (kind, user_id, dedupe_key, send_after, created_at)
    SELECT 'BUDGET_REMINDER', u.id, ${`budget-reminder:${quarter}:`}::text || u.id,
      ${now}::timestamptz, ${now}::timestamptz
    FROM users u
    WHERE u.active AND u.email_budget_reminder
    ON CONFLICT (dedupe_key) DO NOTHING`);
}

/** Locks up to `limit` due notifications for this transaction; other senders skip them. */
export function claimDue(tx: Db, now: Date, limit: number): Promise<OutboxItem[]> {
  return tx.rows<OutboxItem>(sql`
    SELECT id, kind, user_id AS "userId", shoutout_id AS "shoutoutId", attempts, created_at AS "createdAt"
    FROM notification_outbox
    WHERE status = 'PENDING' AND send_after <= ${now}
    ORDER BY send_after
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED`);
}

export async function markSent(db: Db, id: string, now: Date): Promise<void> {
  await db.execute(sql`
    UPDATE notification_outbox SET status = 'SENT', sent_at = ${now}, attempts = attempts + 1
    WHERE id = ${id}`);
}

/** The notification no longer applies (e.g. the shoutout was deleted, or they turned emails off). */
export async function markSkipped(db: Db, id: string, reason: string): Promise<void> {
  await db.execute(sql`
    UPDATE notification_outbox SET status = 'SKIPPED', last_error = ${reason} WHERE id = ${id}`);
}

/** Records a failed attempt: tries again at `retryAt`, or gives up when that is null. */
export async function markFailed(
  db: Db,
  id: string,
  error: string,
  retryAt: Date | null,
): Promise<void> {
  await db.execute(sql`
    UPDATE notification_outbox
    SET attempts = attempts + 1, last_error = ${error},
      ${retryAt ? sql`send_after = ${retryAt}` : sql`status = 'FAILED'`}
    WHERE id = ${id}`);
}

/** Deletes finished notifications created before `before`. Pending ones are kept. */
export function purgeFinished(db: Db, before: Date): Promise<number> {
  return db.execute(sql`
    DELETE FROM notification_outbox WHERE status <> 'PENDING' AND created_at < ${before}`);
}
