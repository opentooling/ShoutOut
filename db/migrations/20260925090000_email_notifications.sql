-- Email notifications: per-person settings (on by default) and an outbox the
-- app's background sender works through.

ALTER TABLE "users"
  ADD COLUMN "email_on_shoutout" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "email_budget_reminder" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "notification_outbox" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  -- SHOUTOUT_RECEIVED or BUDGET_REMINDER
  "kind" TEXT NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "shoutout_id" TEXT REFERENCES "shoutouts"("id") ON DELETE CASCADE,
  -- One notification per event and person, e.g. budget-reminder:2026-07-01:<user>.
  "dedupe_key" TEXT NOT NULL UNIQUE,
  -- PENDING, SENT, SKIPPED (no longer applies) or FAILED (gave up)
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "send_after" TIMESTAMPTZ(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "sent_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "notification_outbox_due_idx" ON "notification_outbox" ("send_after")
  WHERE "status" = 'PENDING';
CREATE INDEX "notification_outbox_created_idx" ON "notification_outbox" ("created_at");
