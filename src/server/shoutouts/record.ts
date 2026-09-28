import type { Db } from "@/lib/db";
import { sql } from "@/lib/sql";
import type { ModerationStatus, Visibility } from "../types";

/** A shoutout's own columns. */
export interface ShoutoutRecord {
  id: string;
  senderId: string;
  cardId: string;
  message: string;
  visibility: Visibility;
  /** Points each recipient got; 0 for none. */
  points: number;
  moderationStatus: ModerationStatus;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
}

export const SHOUTOUT_COLUMNS = sql`
  id, sender_id AS "senderId", card_id AS "cardId", message, visibility, points,
  moderation_status AS "moderationStatus", created_at AS "createdAt", updated_at AS "updatedAt",
  edited_at AS "editedAt", deleted_at AS "deletedAt"`;

/** Replaces a shoutout's values, keeping the order they were picked in. */
export async function saveValues(db: Db, shoutoutId: string, valueIds: string[]): Promise<void> {
  await db.execute(sql`DELETE FROM shoutout_values WHERE shoutout_id = ${shoutoutId}`);
  await db.execute(sql`
    INSERT INTO shoutout_values (shoutout_id, value_id, position)
    SELECT ${shoutoutId}::text, v.id, v.position - 1
    FROM unnest(${valueIds}::text[]) WITH ORDINALITY AS v(id, position)`);
}

/** A shoutout's value ids, in order. */
export async function loadValueIds(db: Db, shoutoutId: string): Promise<string[]> {
  const rows = await db.rows<{ valueId: string }>(sql`
    SELECT value_id AS "valueId" FROM shoutout_values
    WHERE shoutout_id = ${shoutoutId} ORDER BY position`);
  return rows.map((row) => row.valueId);
}
