import { afterAll, beforeEach, inject } from "vitest";
import { DEFAULT_CARD_DESIGNS } from "@/components/cards/designs";
import { createDb, type Db } from "@/lib/db";
import { sql } from "@/lib/sql";

const SEEDED_VALUES = ["Integrity", "Diversity", "Excellence", "Collaboration", "Engagement"];

/** Real Postgres for integration tests, emptied before each test. */
export function useTestDb(): Db {
  const db = createDb(inject("databaseUrl"));

  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE users, shoutouts, shoutout_recipients, reactions, comments, reports, audit_logs,
        notification_outbox
      RESTART IDENTITY CASCADE`);
    // Restore the seeded catalogue exactly as the migrations left it.
    await db.execute(sql`DELETE FROM cards WHERE id NOT LIKE 'card\_%'`);
    await db.execute(sql`DELETE FROM company_values WHERE id NOT LIKE 'value\_%'`);
    for (const [index, card] of DEFAULT_CARD_DESIGNS.entries()) {
      await db.execute(sql`
        UPDATE cards SET slug = ${card.slug}, title = ${card.title}, tagline = ${card.tagline},
          illustration = ${card.illustration}, tone = ${card.tone}, active = true, sort_order = ${index + 1}
        WHERE id = ${`card_${card.slug}`}`);
    }
    for (const [index, name] of SEEDED_VALUES.entries()) {
      await db.execute(sql`
        UPDATE company_values SET name = ${name}, active = true, sort_order = ${index + 1}
        WHERE id = ${`value_${name.toLowerCase()}`}`);
    }
  });

  afterAll(async () => {
    await db.close();
  });

  return db;
}
