import { z } from "zod";
import type { Db } from "@/lib/db";
import { sql, type Sql } from "@/lib/sql";
import { DomainError } from "../errors";
import { loadShoutoutRows, toFeedItem, visibleTo, type FeedItem } from "../shoutouts/feed";
import type { ModerationStatus, ReportReason, ReportResolution } from "../types";
import { recordAudit } from "./audit";

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "INAPPROPRIATE", label: "Inappropriate for work" },
  { value: "OFFENSIVE", label: "Offensive or hurtful" },
  { value: "SPAM", label: "Spam or gaming the system" },
  { value: "OTHER", label: "Something else" },
];

export const reportSchema = z.object({
  reason: z.enum(["INAPPROPRIATE", "OFFENSIVE", "SPAM", "OTHER"], { message: "Pick a reason" }),
  note: z
    .string()
    .trim()
    .max(500, "Keep it to 500 characters or fewer")
    .transform((note) => note || undefined),
});

export interface ReportInput {
  reason: ReportReason;
  note?: string;
}

/**
 * Reports a shoutout the reporter can see. It is hidden from everyone straight
 * away until an admin restores or removes it.
 */
export async function reportShoutout(
  db: Db,
  reporterId: string,
  shoutoutId: string,
  input: ReportInput,
  now = new Date(),
) {
  // Checked first: once reported, the shoutout is hidden from the reporter too.
  const existing = await db.one(
    sql`SELECT id FROM reports WHERE shoutout_id = ${shoutoutId} AND reporter_id = ${reporterId}`,
  );
  if (existing) throw new DomainError("ALREADY_REPORTED", "You've already reported this shoutout");
  const shoutout = await db.one<{ senderId: string }>(sql`
    SELECT s.sender_id AS "senderId" FROM shoutouts s
    WHERE s.id = ${shoutoutId} AND ${visibleTo(reporterId)}`);
  if (!shoutout) throw new DomainError("NOT_FOUND", "That shoutout doesn't exist");
  if (shoutout.senderId === reporterId) {
    throw new DomainError("FORBIDDEN", "You can't report your own shoutout. Delete it instead.");
  }

  return db.transaction(async (tx) => {
    const report = await tx.one<{ id: string; reason: ReportReason; note: string | null }>(sql`
      INSERT INTO reports (shoutout_id, reporter_id, reason, note, created_at)
      VALUES (${shoutoutId}, ${reporterId}, ${input.reason}, ${input.note ?? null}, ${now})
      RETURNING id, reason, note`);
    await tx.execute(sql`
      UPDATE shoutouts SET moderation_status = 'HIDDEN', updated_at = ${now} WHERE id = ${shoutoutId}`);
    await recordAudit(tx, {
      actorId: reporterId,
      action: "shoutout.reported",
      targetType: "shoutout",
      targetId: shoutoutId,
      details: { reason: input.reason },
    });
    return report!;
  });
}

export interface ReportView {
  id: string;
  reason: ReportReason;
  note: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  resolution: ReportResolution | null;
  reporter: { id: string; name: string };
  resolvedBy: { id: string; name: string } | null;
}

export interface ModerationCase {
  shoutout: FeedItem;
  status: ModerationStatus;
  reports: ReportView[];
}

const HAS_OPEN_REPORT = sql`EXISTS (SELECT 1 FROM reports o WHERE o.shoutout_id = s.id AND o.resolved_at IS NULL)`;

async function loadCases(
  db: Db,
  where: Sql,
  limit: number,
  openOnly: boolean,
): Promise<ModerationCase[]> {
  const rows = await loadShoutoutRows(db, sql`s.deleted_at IS NULL AND ${where}`, {
    orderBy: sql`s.updated_at DESC, s.id DESC`,
    limit,
  });
  if (rows.length === 0) return [];
  const reports = await db.rows<ReportView & { shoutoutId: string }>(sql`
    SELECT r.id, r.shoutout_id AS "shoutoutId", r.reason, r.note, r.created_at AS "createdAt",
      r.resolved_at AS "resolvedAt", r.resolution,
      json_build_object('id', rp.id, 'name', rp.name) AS reporter,
      CASE WHEN rb.id IS NULL THEN NULL ELSE json_build_object('id', rb.id, 'name', rb.name) END AS "resolvedBy"
    FROM reports r
    JOIN users rp ON rp.id = r.reporter_id
    LEFT JOIN users rb ON rb.id = r.resolved_by_id
    WHERE r.shoutout_id = ANY(${rows.map((row) => row.id)}::text[])
      ${openOnly ? sql`AND r.resolved_at IS NULL` : sql``}
    ORDER BY r.created_at ASC, r.id ASC`);
  return rows.map((row) => ({
    status: row.moderationStatus,
    reports: reports
      .filter((report) => report.shoutoutId === row.id)
      .map(({ shoutoutId: _shoutoutId, ...report }) => report),
    shoutout: {
      ...toFeedItem(row, "", new Date(), { admin: true }),
      canModify: false,
      canReport: false,
    },
  }));
}

/** Hidden shoutouts waiting for review, oldest report first. Includes private ones. */
export async function listPendingCases(db: Db, limit = 50): Promise<ModerationCase[]> {
  const cases = await loadCases(
    db,
    sql`s.moderation_status = 'HIDDEN' AND ${HAS_OPEN_REPORT}`,
    limit,
    true,
  );
  return cases.sort((a, b) => a.reports[0].createdAt.getTime() - b.reports[0].createdAt.getTime());
}

/** Recently reviewed shoutouts. */
export function listResolvedCases(db: Db, limit = 20): Promise<ModerationCase[]> {
  return loadCases(
    db,
    sql`EXISTS (SELECT 1 FROM reports d WHERE d.shoutout_id = s.id AND d.resolved_at IS NOT NULL)
      AND NOT ${HAS_OPEN_REPORT}`,
    limit,
    false,
  );
}

export async function countPendingCases(db: Db): Promise<number> {
  const row = await db.one<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count FROM shoutouts s
    WHERE s.deleted_at IS NULL AND s.moderation_status = 'HIDDEN' AND ${HAS_OPEN_REPORT}`);
  return row!.count;
}

/** Restores (makes visible again) or removes a reported shoutout and closes its reports. */
export async function resolveCase(
  db: Db,
  adminId: string,
  shoutoutId: string,
  resolution: ReportResolution,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const shoutout = await tx.one(sql`
      SELECT id FROM shoutouts
      WHERE id = ${shoutoutId} AND deleted_at IS NULL AND moderation_status = 'HIDDEN'
      FOR UPDATE`);
    if (!shoutout) {
      throw new DomainError("INVALID_STATE", "This shoutout isn't waiting for review any more");
    }
    const count = await tx.execute(sql`
      UPDATE reports SET resolved_at = ${now}, resolution = ${resolution}, resolved_by_id = ${adminId}
      WHERE shoutout_id = ${shoutoutId} AND resolved_at IS NULL`);
    await tx.execute(sql`
      UPDATE shoutouts
      SET moderation_status = ${resolution === "RESTORED" ? "VISIBLE" : "REMOVED"}, updated_at = ${now}
      WHERE id = ${shoutoutId}`);
    await recordAudit(tx, {
      actorId: adminId,
      action: resolution === "RESTORED" ? "shoutout.restored" : "shoutout.removed",
      targetType: "shoutout",
      targetId: shoutoutId,
      details: { reports: count },
    });
  });
}
