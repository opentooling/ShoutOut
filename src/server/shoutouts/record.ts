import { sql } from "@/lib/sql";
import type { ModerationStatus, Visibility } from "../types";

/** A shoutout's own columns. */
export interface ShoutoutRecord {
  id: string;
  senderId: string;
  cardId: string;
  valueId: string;
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
  id, sender_id AS "senderId", card_id AS "cardId", value_id AS "valueId", message, visibility, points,
  moderation_status AS "moderationStatus", created_at AS "createdAt", updated_at AS "updatedAt",
  edited_at AS "editedAt", deleted_at AS "deletedAt"`;
