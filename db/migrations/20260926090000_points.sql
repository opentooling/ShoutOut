-- Points mode: a shoutout can include points, given to each recipient.
-- 0 means no points (always the case while points mode is off).
ALTER TABLE "shoutouts"
  ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "shoutouts_points_check" CHECK ("points" >= 0);
