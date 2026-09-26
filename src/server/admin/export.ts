import type { Db } from "@/lib/db";
import { sql } from "@/lib/sql";
import { rangeSql, topRecipients, topSenders, topValues } from "../insights/leaderboard";
import type { DateRange, LeaderboardPeriod } from "../insights/periods";
import { PERIOD_LABELS, periodRange } from "../insights/periods";
import { toCsv } from "./csv";

interface ShoutoutExportRow {
  id: string;
  createdAt: Date;
  senderName: string;
  senderEmail: string;
  recipientNames: string;
  recipientEmails: string;
  recipientCount: number;
  card: string;
  value: string;
  visibility: string;
  message: string;
  points: number;
  reactions: number;
  comments: number;
  edited: boolean;
}

/** Visible (not deleted or moderated) shoutouts. Private messages are not exported. */
export async function exportShoutoutsCsv(db: Db, range: DateRange): Promise<string> {
  const rows = await db.rows<ShoutoutExportRow>(sql`
    SELECT s.id, s.created_at AS "createdAt", u.name AS "senderName", u.email AS "senderEmail",
      COALESCE((SELECT string_agg(ru.name, '; ' ORDER BY ru.name, ru.id) FROM shoutout_recipients rr
        JOIN users ru ON ru.id = rr.user_id WHERE rr.shoutout_id = s.id), '') AS "recipientNames",
      COALESCE((SELECT string_agg(ru.email, '; ' ORDER BY ru.name, ru.id) FROM shoutout_recipients rr
        JOIN users ru ON ru.id = rr.user_id WHERE rr.shoutout_id = s.id), '') AS "recipientEmails",
      (SELECT COUNT(*)::int FROM shoutout_recipients rr WHERE rr.shoutout_id = s.id) AS "recipientCount",
      c.title AS card, v.name AS value, lower(s.visibility::text) AS visibility,
      CASE WHEN s.visibility = 'PUBLIC' THEN s.message ELSE '[private]' END AS message,
      s.points,
      (SELECT COUNT(*)::int FROM reactions re WHERE re.shoutout_id = s.id) AS reactions,
      (SELECT COUNT(*)::int FROM comments cm WHERE cm.shoutout_id = s.id AND cm.deleted_at IS NULL) AS comments,
      s.edited_at IS NOT NULL AS edited
    FROM shoutouts s
    JOIN users u ON u.id = s.sender_id
    JOIN cards c ON c.id = s.card_id
    JOIN company_values v ON v.id = s.value_id
    WHERE ${rangeSql(range)}
    ORDER BY s.created_at ASC, s.id ASC`);
  return toCsv(rows, [
    { header: "id", value: (r) => r.id },
    { header: "created_at", value: (r) => r.createdAt },
    { header: "sender_name", value: (r) => r.senderName },
    { header: "sender_email", value: (r) => r.senderEmail },
    { header: "recipient_names", value: (r) => r.recipientNames },
    { header: "recipient_emails", value: (r) => r.recipientEmails },
    { header: "recipient_count", value: (r) => r.recipientCount },
    { header: "card", value: (r) => r.card },
    { header: "value", value: (r) => r.value },
    { header: "visibility", value: (r) => r.visibility },
    { header: "message", value: (r) => r.message },
    { header: "points_per_recipient", value: (r) => r.points },
    { header: "reactions", value: (r) => r.reactions },
    { header: "comments", value: (r) => r.comments },
    { header: "edited", value: (r) => r.edited },
  ]);
}

interface PersonRow {
  name: string;
  email: string;
  active: boolean;
  received: number;
  recognised: number;
  sent: number;
  lastReceivedAt: Date | null;
  lastSentAt: Date | null;
}

/** One row per person: activity within the range. */
export async function exportPeopleCsv(db: Db, range: DateRange): Promise<string> {
  const where = rangeSql(range);
  const rows = await db.rows<PersonRow>(sql`
    SELECT u.name, u.email, u.active,
      (SELECT COUNT(*)::int FROM shoutout_recipients r JOIN shoutouts s ON s.id = r.shoutout_id
        WHERE r.user_id = u.id AND ${where}) AS received,
      (SELECT COUNT(*)::int FROM shoutout_recipients r JOIN shoutouts s ON s.id = r.shoutout_id
        WHERE s.sender_id = u.id AND ${where}) AS recognised,
      (SELECT COUNT(*)::int FROM shoutouts s WHERE s.sender_id = u.id AND ${where}) AS sent,
      (SELECT MAX(s.created_at) FROM shoutout_recipients r JOIN shoutouts s ON s.id = r.shoutout_id
        WHERE r.user_id = u.id AND ${where}) AS "lastReceivedAt",
      (SELECT MAX(s.created_at) FROM shoutouts s WHERE s.sender_id = u.id AND ${where}) AS "lastSentAt"
    FROM users u
    ORDER BY u.name ASC, u.email ASC`);
  return toCsv(rows, [
    { header: "name", value: (r) => r.name },
    { header: "email", value: (r) => r.email },
    { header: "active", value: (r) => r.active },
    { header: "shoutouts_received", value: (r) => r.received },
    { header: "shoutouts_sent", value: (r) => r.sent },
    { header: "colleagues_recognised", value: (r) => r.recognised },
    { header: "last_received_at", value: (r) => r.lastReceivedAt },
    { header: "last_sent_at", value: (r) => r.lastSentAt },
  ]);
}

/** All three leaderboards (full rankings, not just the top 10) for a period. */
export async function exportLeaderboardsCsv(
  db: Db,
  period: LeaderboardPeriod,
  now = new Date(),
): Promise<string> {
  const range = periodRange(period, now);
  const [recipients, senders, values] = await Promise.all([
    topRecipients(db, range, Number.MAX_SAFE_INTEGER),
    topSenders(db, range, Number.MAX_SAFE_INTEGER),
    topValues(db, range),
  ]);
  const rows = [
    ...recipients.entries.map((e) => ({
      board: "Most recognised",
      unit: "shoutouts received",
      ...e,
    })),
    ...senders.entries.map((e) => ({
      board: "Top recognisers",
      unit: "colleagues recognised",
      ...e,
    })),
    ...values.entries.map((e) => ({ board: "Top values", unit: "shoutouts", ...e })),
  ];
  return toCsv(rows, [
    { header: "period", value: () => PERIOD_LABELS[period] },
    { header: "board", value: (r) => r.board },
    { header: "rank", value: (r) => r.rank },
    { header: "name", value: (r) => r.name },
    { header: "count", value: (r) => r.count },
    { header: "unit", value: (r) => r.unit },
  ]);
}
