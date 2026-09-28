import type { Db } from "@/lib/db";
import { sql } from "@/lib/sql";
import { DomainError } from "../errors";
import { loadValueIds, saveValues, SHOUTOUT_COLUMNS, type ShoutoutRecord } from "./record";
import type { EditShoutoutInput } from "./validation";

export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canModify(
  shoutout: {
    senderId: string;
    createdAt: Date;
    deletedAt?: Date | null;
    moderationStatus?: string;
  },
  userId: string,
  now = new Date(),
): boolean {
  return (
    !shoutout.deletedAt &&
    (shoutout.moderationStatus ?? "VISIBLE") === "VISIBLE" &&
    shoutout.senderId === userId &&
    now.getTime() - shoutout.createdAt.getTime() <= EDIT_WINDOW_MS
  );
}

async function loadModifiable(db: Db, userId: string, id: string, now: Date) {
  const shoutout = await db.one<ShoutoutRecord>(sql`
    SELECT ${SHOUTOUT_COLUMNS} FROM shoutouts
    WHERE id = ${id} AND deleted_at IS NULL AND moderation_status = 'VISIBLE'`);
  if (!shoutout) throw new DomainError("NOT_FOUND", "That shoutout doesn't exist");
  if (shoutout.senderId !== userId) {
    throw new DomainError("FORBIDDEN", "Only the sender can change this shoutout");
  }
  if (!canModify(shoutout, userId, now)) {
    throw new DomainError(
      "EDIT_WINDOW_CLOSED",
      "Shoutouts can only be changed within 24 hours of sending",
    );
  }
  return shoutout;
}

export async function updateShoutout(
  db: Db,
  userId: string,
  id: string,
  input: EditShoutoutInput,
  now = new Date(),
): Promise<ShoutoutRecord> {
  const shoutout = await loadModifiable(db, userId, id, now);

  // A card or value retired after sending can be kept, but not newly chosen.
  if (input.cardId !== shoutout.cardId) {
    const card = await db.one(sql`SELECT id FROM cards WHERE id = ${input.cardId} AND active`);
    if (!card) throw new DomainError("CARD_NOT_FOUND", "That card isn't available", "cardId");
  }
  const valueIds = [...new Set(input.valueIds)];
  const current = await loadValueIds(db, id);
  const added = valueIds.filter((valueId) => !current.includes(valueId));
  if (added.length > 0) {
    const active = await db.rows(
      sql`SELECT id FROM company_values WHERE id = ANY(${added}::text[]) AND active`,
    );
    if (active.length !== added.length) {
      throw new DomainError("VALUE_NOT_FOUND", "That value isn't available", "valueIds");
    }
  }

  return db.transaction(async (tx) => {
    await saveValues(tx, id, valueIds);
    return (await tx.one<ShoutoutRecord>(sql`
      UPDATE shoutouts SET card_id = ${input.cardId},
        message = ${input.message}, visibility = ${input.visibility}, edited_at = ${now}, updated_at = ${now}
      WHERE id = ${id}
      RETURNING ${SHOUTOUT_COLUMNS}`))!;
  });
}

/** Soft-deletes the shoutout; its recipients no longer count against the budget. */
export async function deleteShoutout(db: Db, userId: string, id: string, now = new Date()) {
  await loadModifiable(db, userId, id, now);
  await db.execute(
    sql`UPDATE shoutouts SET deleted_at = ${now}, updated_at = ${now} WHERE id = ${id}`,
  );
}
