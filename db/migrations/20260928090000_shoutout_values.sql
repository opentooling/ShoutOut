-- A shoutout can celebrate several company values. They move from
-- shoutouts.value_id to their own table; position keeps the order they were picked.
CREATE TABLE "shoutout_values" (
  "shoutout_id" TEXT NOT NULL REFERENCES "shoutouts"("id") ON DELETE CASCADE,
  "value_id" TEXT NOT NULL REFERENCES "company_values"("id") ON DELETE RESTRICT,
  "position" INTEGER NOT NULL,
  PRIMARY KEY ("shoutout_id", "value_id")
);

CREATE INDEX "shoutout_values_value_id_idx" ON "shoutout_values" ("value_id");

INSERT INTO "shoutout_values" ("shoutout_id", "value_id", "position")
SELECT "id", "value_id", 0 FROM "shoutouts";

ALTER TABLE "shoutouts" DROP COLUMN "value_id";
