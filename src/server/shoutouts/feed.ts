import type { Db } from "@/lib/db";
import { summarizeReactions, type ReactionSummary } from "@/lib/reactions";
import { empty, join, sql, type Sql } from "@/lib/sql";
import type { ModerationStatus, Visibility } from "../types";
import { canModify } from "./manage";

export interface FeedItem {
  id: string;
  message: string;
  visibility: Visibility;
  /**
   * Points each recipient got. Only the sender, the recipients and admins see
   * the amount; for everyone else (and when there are none) it is null.
   */
  points: number | null;
  createdAt: Date;
  editedAt: Date | null;
  card: {
    id: string;
    slug: string;
    title: string;
    tagline: string;
    illustration: string;
    tone: string;
  };
  value: { id: string; name: string };
  sender: { id: string; name: string };
  recipients: { id: string; name: string }[];
  reactions: ReactionSummary[];
  commentCount: number;
  canModify: boolean;
  /** Anyone except the sender can report a shoutout. */
  canReport: boolean;
}

export interface FeedFilters {
  /** Shoutouts this person sent or received. */
  personId?: string;
  valueId?: string;
  cardId?: string;
  /** Inclusive start of day (UTC). */
  from?: Date;
  /** Inclusive end day (UTC); everything before the following midnight. */
  to?: Date;
  /** Text in the message. */
  query?: string;
}

/** A shoutout with everything needed to show it, as returned by `loadShoutoutRows`. */
export interface ShoutoutRow {
  id: string;
  message: string;
  visibility: Visibility;
  points: number;
  moderationStatus: ModerationStatus;
  senderId: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  card: FeedItem["card"];
  value: FeedItem["value"];
  sender: FeedItem["sender"];
  recipients: FeedItem["recipients"];
  reactions: { emoji: string; userId: string; user: { name: string } }[];
  commentCount: number;
}

/** Public shoutouts, plus private ones the viewer sent or received. Uses the alias `s`. */
export function visibleTo(viewerId: string): Sql {
  return sql`(s.deleted_at IS NULL AND s.moderation_status = 'VISIBLE' AND (
    s.visibility = 'PUBLIC' OR s.sender_id = ${viewerId}
    OR EXISTS (SELECT 1 FROM shoutout_recipients vr WHERE vr.shoutout_id = s.id AND vr.user_id = ${viewerId})
  ))`;
}

export function involving(personId: string): Sql {
  return sql`(s.sender_id = ${personId}
    OR EXISTS (SELECT 1 FROM shoutout_recipients ir WHERE ir.shoutout_id = s.id AND ir.user_id = ${personId}))`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function filtersWhere(filters: FeedFilters): Sql[] {
  const where: Sql[] = [];
  if (filters.personId) where.push(involving(filters.personId));
  if (filters.valueId) where.push(sql`s.value_id = ${filters.valueId}`);
  if (filters.cardId) where.push(sql`s.card_id = ${filters.cardId}`);
  if (filters.from) where.push(sql`s.created_at >= ${filters.from}`);
  if (filters.to) where.push(sql`s.created_at < ${new Date(filters.to.getTime() + DAY_MS)}`);
  const query = filters.query?.trim();
  if (query) {
    where.push(sql`s.message ILIKE ${`%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}`);
  }
  return where;
}

/** Loads shoutouts (alias `s`) with their card, value, people, reactions and comment count. */
export function loadShoutoutRows(
  db: Db,
  where: Sql,
  { orderBy = sql`s.created_at DESC, s.id DESC`, limit }: { orderBy?: Sql; limit: number },
): Promise<ShoutoutRow[]> {
  return db.rows<ShoutoutRow>(sql`
    SELECT
      s.id, s.message, s.visibility, s.points, s.moderation_status AS "moderationStatus",
      s.sender_id AS "senderId", s.created_at AS "createdAt", s.edited_at AS "editedAt",
      s.deleted_at AS "deletedAt",
      json_build_object('id', c.id, 'slug', c.slug, 'title', c.title, 'tagline', c.tagline,
        'illustration', c.illustration, 'tone', c.tone) AS card,
      json_build_object('id', v.id, 'name', v.name) AS value,
      json_build_object('id', u.id, 'name', u.name) AS sender,
      COALESCE((
        SELECT json_agg(json_build_object('id', ru.id, 'name', ru.name) ORDER BY ru.name, ru.id)
        FROM shoutout_recipients rr JOIN users ru ON ru.id = rr.user_id
        WHERE rr.shoutout_id = s.id), '[]') AS recipients,
      COALESCE((
        SELECT json_agg(json_build_object('emoji', re.emoji, 'userId', re.user_id,
          'user', json_build_object('name', reu.name)) ORDER BY re.created_at, re.user_id)
        FROM reactions re JOIN users reu ON reu.id = re.user_id
        WHERE re.shoutout_id = s.id), '[]') AS reactions,
      (SELECT COUNT(*)::int FROM comments cm
        WHERE cm.shoutout_id = s.id AND cm.deleted_at IS NULL) AS "commentCount"
    FROM shoutouts s
    JOIN cards c ON c.id = s.card_id
    JOIN company_values v ON v.id = s.value_id
    JOIN users u ON u.id = s.sender_id
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ${limit}`);
}

export interface ViewOptions {
  /** Admins see the points on every shoutout they can see. */
  admin?: boolean;
}

function pointsFor(row: ShoutoutRow, viewerId: string, { admin }: ViewOptions): number | null {
  if (row.points <= 0) return null;
  const involved =
    row.senderId === viewerId || row.recipients.some((recipient) => recipient.id === viewerId);
  return involved || admin ? row.points : null;
}

export function toFeedItem(
  row: ShoutoutRow,
  viewerId: string,
  now: Date,
  view: ViewOptions = {},
): FeedItem {
  return {
    id: row.id,
    message: row.message,
    visibility: row.visibility,
    points: pointsFor(row, viewerId, view),
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    card: row.card,
    value: row.value,
    sender: row.sender,
    recipients: row.recipients,
    reactions: summarizeReactions(row.reactions, viewerId),
    commentCount: row.commentCount,
    canModify: canModify(row, viewerId, now),
    canReport: row.senderId !== viewerId,
  };
}

export interface Page {
  items: FeedItem[];
  nextCursor: string | null;
}

/** Newest-first shoutouts matching `where`, with cursor paging. */
export async function listShoutouts(
  db: Db,
  viewerId: string,
  where: Sql,
  {
    cursor,
    limit = 20,
    now = new Date(),
    ...view
  }: { cursor?: string; limit?: number; now?: Date } & ViewOptions = {},
): Promise<Page> {
  const afterCursor = cursor
    ? sql`AND (s.created_at, s.id) < (SELECT created_at, id FROM shoutouts WHERE id = ${cursor})`
    : empty;
  const rows = await loadShoutoutRows(db, sql`${where} ${afterCursor}`, { limit: limit + 1 });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: page.map((row) => toFeedItem(row, viewerId, now, view)),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export function listFeed(
  db: Db,
  viewerId: string,
  options: {
    cursor?: string;
    limit?: number;
    now?: Date;
    filters?: FeedFilters;
  } & ViewOptions = {},
): Promise<Page> {
  const { filters = {}, ...paging } = options;
  return listShoutouts(
    db,
    viewerId,
    join([visibleTo(viewerId), ...filtersWhere(filters)], " AND "),
    paging,
  );
}

export async function getVisibleShoutout(
  db: Db,
  viewerId: string,
  id: string,
  now = new Date(),
  view: ViewOptions = {},
): Promise<FeedItem | null> {
  const [row] = await loadShoutoutRows(db, sql`s.id = ${id} AND ${visibleTo(viewerId)}`, {
    limit: 1,
  });
  return row ? toFeedItem(row, viewerId, now, view) : null;
}
