import type { Db } from "@/lib/db";
import { sql } from "@/lib/sql";
import { quarterBounds } from "../shoutouts/quarter";
import { toCsv } from "./csv";

export interface PointsRow {
  id: string;
  name: string;
  email: string;
  active: boolean;
  /** Everything received that counts (not deleted, hidden or removed). Nothing can be spent yet. */
  balance: number;
  receivedThisQuarter: number;
  givenThisQuarter: number;
}

/**
 * Everyone who has received or given points, highest balance first. Received
 * points count only from visible shoutouts; given points count every
 * non-deleted shoutout, the same as the sender's points budget.
 */
export function listPointsBalances(db: Db, now = new Date()): Promise<PointsRow[]> {
  const { start, end } = quarterBounds(now);
  return db.rows<PointsRow>(sql`
    WITH received AS (
      SELECT r.user_id,
        SUM(s.points)::int AS balance,
        (SUM(s.points) FILTER (WHERE s.created_at >= ${start} AND s.created_at < ${end}))::int AS quarter
      FROM shoutout_recipients r JOIN shoutouts s ON s.id = r.shoutout_id
      WHERE s.points > 0 AND s.deleted_at IS NULL AND s.moderation_status = 'VISIBLE'
      GROUP BY r.user_id
    ), given AS (
      SELECT s.sender_id AS user_id, SUM(s.points)::int AS quarter
      FROM shoutouts s JOIN shoutout_recipients r ON r.shoutout_id = s.id
      WHERE s.points > 0 AND s.deleted_at IS NULL
        AND s.created_at >= ${start} AND s.created_at < ${end}
      GROUP BY s.sender_id
    )
    SELECT u.id, u.name, u.email, u.active,
      COALESCE(rc.balance, 0) AS balance,
      COALESCE(rc.quarter, 0) AS "receivedThisQuarter",
      COALESCE(g.quarter, 0) AS "givenThisQuarter"
    FROM users u
    LEFT JOIN received rc ON rc.user_id = u.id
    LEFT JOIN given g ON g.user_id = u.id
    WHERE rc.user_id IS NOT NULL OR g.user_id IS NOT NULL
    ORDER BY COALESCE(rc.balance, 0) DESC, u.name ASC, u.email ASC`);
}

export async function exportPointsCsv(db: Db, now = new Date()): Promise<string> {
  const rows = await listPointsBalances(db, now);
  return toCsv(rows, [
    { header: "name", value: (r) => r.name },
    { header: "email", value: (r) => r.email },
    { header: "active", value: (r) => r.active },
    { header: "points_balance", value: (r) => r.balance },
    { header: "points_received_this_quarter", value: (r) => r.receivedThisQuarter },
    { header: "points_given_this_quarter", value: (r) => r.givenThisQuarter },
  ]);
}
