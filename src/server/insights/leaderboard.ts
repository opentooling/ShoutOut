import type { Db } from "@/lib/db";
import { join, sql, type Sql } from "@/lib/sql";
import type { DateRange } from "./periods";

export interface RankedEntry {
  id: string;
  name: string;
  count: number;
  /** Competition ranking: ties share a rank, e.g. 1, 2, 2, 4. */
  rank: number;
}

export interface Board {
  entries: RankedEntry[];
  /** The viewer's own row when they are ranked but outside the top entries. */
  viewer: RankedEntry | null;
  /** Highest count, for scaling bars. */
  max: number;
}

/** Visible (not deleted or moderated) shoutouts in the range; uses the alias `s`. */
function rangeSql(range: DateRange): Sql {
  const parts = [sql`s.deleted_at IS NULL`, sql`s.moderation_status = 'VISIBLE'`];
  if (range.start) parts.push(sql`s.created_at >= ${range.start}`);
  if (range.end) parts.push(sql`s.created_at < ${range.end}`);
  return join(parts, " AND ");
}

function toBoard(rows: RankedEntry[], limit: number, viewerId?: string): Board {
  const entries = rows.slice(0, limit);
  const viewerRow = viewerId ? rows.find((row) => row.id === viewerId) : undefined;
  return {
    entries,
    viewer: viewerRow && !entries.includes(viewerRow) ? viewerRow : null,
    max: rows[0]?.count ?? 0,
  };
}

/**
 * People who received the most shoutouts. Private shoutouts count too (only the
 * numbers are shown). People no longer active are left out.
 */
export async function topRecipients(
  db: Db,
  range: DateRange,
  limit = 10,
  viewerId?: string,
): Promise<Board> {
  const rows = await db.rows<RankedEntry>(sql`
    SELECT u.id, u.name, COUNT(*)::int AS count,
           RANK() OVER (ORDER BY COUNT(*) DESC)::int AS rank
    FROM shoutout_recipients r
    JOIN shoutouts s ON s.id = r.shoutout_id
    JOIN users u ON u.id = r.user_id
    WHERE u.active AND ${rangeSql(range)}
    GROUP BY u.id, u.name
    ORDER BY count DESC, u.name ASC`);
  return toBoard(rows, limit, viewerId);
}

/** People who recognised the most colleagues (each recipient counts, like the budget). */
export async function topSenders(
  db: Db,
  range: DateRange,
  limit = 10,
  viewerId?: string,
): Promise<Board> {
  const rows = await db.rows<RankedEntry>(sql`
    SELECT u.id, u.name, COUNT(*)::int AS count,
           RANK() OVER (ORDER BY COUNT(*) DESC)::int AS rank
    FROM shoutout_recipients r
    JOIN shoutouts s ON s.id = r.shoutout_id
    JOIN users u ON u.id = s.sender_id
    WHERE u.active AND ${rangeSql(range)}
    GROUP BY u.id, u.name
    ORDER BY count DESC, u.name ASC`);
  return toBoard(rows, limit, viewerId);
}

/**
 * People who received the most points (points mode). Like the other boards,
 * only visible shoutouts count and people no longer active are left out.
 */
export async function topPointsRecipients(
  db: Db,
  range: DateRange,
  limit = 10,
  viewerId?: string,
): Promise<Board> {
  const rows = await db.rows<RankedEntry>(sql`
    SELECT u.id, u.name, SUM(s.points)::int AS count,
           RANK() OVER (ORDER BY SUM(s.points) DESC)::int AS rank
    FROM shoutout_recipients r
    JOIN shoutouts s ON s.id = r.shoutout_id
    JOIN users u ON u.id = r.user_id
    WHERE u.active AND s.points > 0 AND ${rangeSql(range)}
    GROUP BY u.id, u.name
    ORDER BY count DESC, u.name ASC`);
  return toBoard(rows, limit, viewerId);
}

/**
 * The same board with the numbers removed, for boards where only the order may
 * be shown (points totals are private to each person and admins).
 */
export function ranksOnly(board: Board): Board {
  const strip = (entry: RankedEntry): RankedEntry => ({ ...entry, count: 0 });
  return {
    entries: board.entries.map(strip),
    viewer: board.viewer && strip(board.viewer),
    max: 0,
  };
}

/** Company values by number of shoutouts. */
export async function topValues(db: Db, range: DateRange): Promise<Board> {
  const rows = await db.rows<RankedEntry>(sql`
    SELECT v.id, v.name, COUNT(*)::int AS count,
           RANK() OVER (ORDER BY COUNT(*) DESC)::int AS rank
    FROM shoutouts s
    JOIN company_values v ON v.id = s.value_id
    WHERE ${rangeSql(range)}
    GROUP BY v.id, v.name
    ORDER BY count DESC, v.name ASC`);
  return toBoard(rows, rows.length);
}

export { rangeSql };
