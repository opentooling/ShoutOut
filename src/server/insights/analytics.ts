import type { Db } from "@/lib/db";
import { sql } from "@/lib/sql";
import { rangeSql } from "./leaderboard";
import type { DateRange } from "./periods";

export interface Summary {
  shoutouts: number;
  recognitions: number;
  activePeople: number;
  /** Active people who sent at least one shoutout. */
  givers: number;
  /** Active people who received at least one shoutout. */
  receivers: number;
}

export async function getSummary(db: Db, range: Required<DateRange>): Promise<Summary> {
  const row = await db.one<Summary>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM shoutouts s WHERE ${rangeSql(range)}) AS shoutouts,
      (SELECT COUNT(*)::int FROM shoutout_recipients r JOIN shoutouts s ON s.id = r.shoutout_id
        WHERE ${rangeSql(range)}) AS recognitions,
      (SELECT COUNT(*)::int FROM users WHERE active) AS "activePeople",
      (SELECT COUNT(DISTINCT s.sender_id)::int FROM shoutouts s JOIN users u ON u.id = s.sender_id
        WHERE u.active AND ${rangeSql(range)}) AS givers,
      (SELECT COUNT(DISTINCT r.user_id)::int FROM shoutout_recipients r
        JOIN shoutouts s ON s.id = r.shoutout_id JOIN users u ON u.id = r.user_id
        WHERE u.active AND ${rangeSql(range)}) AS receivers`);
  return row!;
}

export { percent } from "./format";

/** Relative change, e.g. 25 for +25%; null when there's nothing to compare against. */
export function change(current: number, previous: number): number | null {
  return previous === 0 ? null : Math.round(((current - previous) / previous) * 100);
}

export type Bucket = "week" | "month";

export interface TrendPoint {
  start: Date;
  count: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of the UTC week (Monday) or month containing `date`. */
export function bucketStart(date: Date, bucket: Bucket): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  if (bucket === "month") return new Date(Date.UTC(y, m, 1));
  const d = date.getUTCDate() - ((date.getUTCDay() + 6) % 7);
  return new Date(Date.UTC(y, m, d));
}

function nextBucket(date: Date, bucket: Bucket): Date {
  return bucket === "month"
    ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
    : new Date(date.getTime() + 7 * DAY_MS);
}

/** Shoutouts per week or month across the range, including empty buckets. */
export async function getTrend(
  db: Db,
  range: Required<DateRange>,
  bucket: Bucket,
): Promise<TrendPoint[]> {
  const rows = await db.rows<{ start: Date; count: number }>(sql`
    SELECT date_trunc(${bucket}, s.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS start,
           COUNT(*)::int AS count
    FROM shoutouts s
    WHERE ${rangeSql(range)}
    GROUP BY 1
    ORDER BY 1`);
  const counts = new Map(rows.map((row) => [row.start.getTime(), row.count]));
  const points: TrendPoint[] = [];
  for (
    let start = bucketStart(range.start, bucket);
    start < range.end;
    start = nextBucket(start, bucket)
  ) {
    points.push({ start, count: counts.get(start.getTime()) ?? 0 });
  }
  return points;
}

export interface Breakdown {
  id: string;
  name: string;
  count: number;
}

export function getValueBreakdown(db: Db, range: DateRange): Promise<Breakdown[]> {
  return db.rows<Breakdown>(sql`
    SELECT v.id, v.name, COUNT(s.id)::int AS count
    FROM company_values v
    LEFT JOIN shoutout_values sv ON sv.value_id = v.id
    LEFT JOIN shoutouts s ON s.id = sv.shoutout_id AND ${rangeSql(range)}
    WHERE v.active OR s.id IS NOT NULL
    GROUP BY v.id, v.name, v.sort_order
    ORDER BY count DESC, v.sort_order ASC`);
}

export function getCardBreakdown(db: Db, range: DateRange): Promise<Breakdown[]> {
  return db.rows<Breakdown>(sql`
    SELECT c.id, c.title AS name, COUNT(s.id)::int AS count
    FROM cards c
    LEFT JOIN shoutouts s ON s.card_id = c.id AND ${rangeSql(range)}
    WHERE c.active OR s.id IS NOT NULL
    GROUP BY c.id, c.title, c.sort_order
    ORDER BY count DESC, c.sort_order ASC`);
}

export interface UnrecognisedPerson {
  id: string;
  name: string;
  email: string;
  lastRecognisedAt: Date | null;
}

/** Active people with no shoutout received since `since`, longest-waiting first. */
export function getUnrecognised(db: Db, since: Date, limit = 50): Promise<UnrecognisedPerson[]> {
  return db.rows<UnrecognisedPerson>(sql`
    SELECT u.id, u.name, u.email, MAX(s.created_at) AS "lastRecognisedAt"
    FROM users u
    LEFT JOIN shoutout_recipients r ON r.user_id = u.id
    LEFT JOIN shoutouts s ON s.id = r.shoutout_id AND s.deleted_at IS NULL
      AND s.moderation_status = 'VISIBLE'
    WHERE u.active
    GROUP BY u.id, u.name, u.email
    HAVING MAX(s.created_at) IS NULL OR MAX(s.created_at) < ${since}
    ORDER BY MAX(s.created_at) ASC NULLS FIRST, u.name ASC
    LIMIT ${limit}`);
}
