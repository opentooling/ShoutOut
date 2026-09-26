import type { Db } from "@/lib/db";
import { sql } from "@/lib/sql";
import { quarterBounds } from "./quarter";

export interface Budget {
  allowance: number;
  used: number;
  remaining: number;
  resetsAt: Date;
}

/** Each recipient of a non-deleted shoutout sent this quarter uses one unit of budget. */
export async function getBudget(
  db: Db,
  userId: string,
  allowance: number,
  now = new Date(),
): Promise<Budget> {
  const { start, end } = quarterBounds(now);
  const row = await db.one<{ used: number }>(sql`
    SELECT COUNT(*)::int AS used
    FROM shoutout_recipients r JOIN shoutouts s ON s.id = r.shoutout_id
    WHERE s.sender_id = ${userId} AND s.deleted_at IS NULL
      AND s.created_at >= ${start} AND s.created_at < ${end}`);
  const used = row!.used;
  return { allowance, used, remaining: Math.max(0, allowance - used), resetsAt: end };
}

/**
 * Points given this quarter: each recipient of a non-deleted shoutout gets its
 * points, so a 10-point shoutout to three people uses 30.
 */
export async function getPointsBudget(
  db: Db,
  userId: string,
  allowance: number,
  now = new Date(),
): Promise<Budget> {
  const { start, end } = quarterBounds(now);
  const row = await db.one<{ used: number }>(sql`
    SELECT COALESCE(SUM(s.points), 0)::int AS used
    FROM shoutout_recipients r JOIN shoutouts s ON s.id = r.shoutout_id
    WHERE s.sender_id = ${userId} AND s.deleted_at IS NULL
      AND s.created_at >= ${start} AND s.created_at < ${end}`);
  const used = row!.used;
  return { allowance, used, remaining: Math.max(0, allowance - used), resetsAt: end };
}

export interface PointsBalance {
  /** All points received that count: from shoutouts that aren't deleted, hidden or removed. */
  balance: number;
  receivedThisQuarter: number;
}

/**
 * Points someone has received. Nothing can be spent yet, so the balance is
 * everything received; points from a shoutout under review or removed by an
 * admin don't count.
 */
export async function getPointsBalance(
  db: Db,
  userId: string,
  now = new Date(),
): Promise<PointsBalance> {
  const { start } = quarterBounds(now);
  const row = await db.one<PointsBalance>(sql`
    SELECT COALESCE(SUM(s.points), 0)::int AS balance,
      COALESCE(SUM(s.points) FILTER (WHERE s.created_at >= ${start}), 0)::int AS "receivedThisQuarter"
    FROM shoutout_recipients r JOIN shoutouts s ON s.id = r.shoutout_id
    WHERE r.user_id = ${userId} AND s.deleted_at IS NULL AND s.moderation_status = 'VISIBLE'`);
  return row!;
}
