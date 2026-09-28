import type { Db } from "@/lib/db";
import { sql, type Sql } from "@/lib/sql";
import { listShoutouts, visibleTo, type Page, type ViewOptions } from "../shoutouts/feed";

export type ProfileTab = "received" | "sent";

export interface Profile {
  person: { id: string; name: string; email: string; active: boolean };
  isSelf: boolean;
  received: number;
  sent: number;
  topValues: { name: string; count: number }[];
}

/**
 * What a viewer may see on someone's profile: other people see only public
 * shoutouts; on your own profile you also see private ones.
 */
export function profileVisibility(viewerId: string, personId: string): Sql {
  return viewerId === personId
    ? visibleTo(viewerId)
    : sql`s.deleted_at IS NULL AND s.moderation_status = 'VISIBLE' AND s.visibility = 'PUBLIC'`;
}

function tabWhere(personId: string, tab: ProfileTab): Sql {
  return tab === "sent"
    ? sql`s.sender_id = ${personId}`
    : sql`EXISTS (SELECT 1 FROM shoutout_recipients pr WHERE pr.shoutout_id = s.id AND pr.user_id = ${personId})`;
}

export async function getProfile(
  db: Db,
  viewerId: string,
  personId: string,
): Promise<Profile | null> {
  const person = await db.one<Profile["person"]>(
    sql`SELECT id, name, email, active FROM users WHERE id = ${personId}`,
  );
  if (!person) return null;

  const visible = profileVisibility(viewerId, personId);
  const received = sql`${visible} AND ${tabWhere(personId, "received")}`;
  const [counts, topValues] = await Promise.all([
    db.one<{ received: number; sent: number }>(sql`
      SELECT
        (SELECT COUNT(*)::int FROM shoutouts s WHERE ${received}) AS received,
        (SELECT COUNT(*)::int FROM shoutouts s WHERE ${visible} AND ${tabWhere(personId, "sent")}) AS sent`),
    db.rows<{ name: string; count: number }>(sql`
      SELECT v.name, COUNT(*)::int AS count
      FROM shoutouts s
      JOIN shoutout_values sv ON sv.shoutout_id = s.id
      JOIN company_values v ON v.id = sv.value_id
      WHERE ${received}
      GROUP BY v.id, v.name
      ORDER BY count DESC, v.name ASC
      LIMIT 3`),
  ]);

  return { person, isSelf: viewerId === personId, ...counts!, topValues };
}

export function listProfileShoutouts(
  db: Db,
  viewerId: string,
  personId: string,
  tab: ProfileTab,
  options: { cursor?: string; limit?: number; now?: Date } & ViewOptions = {},
): Promise<Page> {
  return listShoutouts(
    db,
    viewerId,
    sql`${profileVisibility(viewerId, personId)} AND ${tabWhere(personId, tab)}`,
    options,
  );
}
