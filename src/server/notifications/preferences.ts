import type { Db } from "@/lib/db";
import { sql } from "@/lib/sql";

/** Which emails someone gets. Both are on by default. */
export interface EmailPreferences {
  onShoutout: boolean;
  budgetReminder: boolean;
}

export async function getEmailPreferences(db: Db, userId: string): Promise<EmailPreferences> {
  const row = await db.one<EmailPreferences>(sql`
    SELECT email_on_shoutout AS "onShoutout", email_budget_reminder AS "budgetReminder"
    FROM users WHERE id = ${userId}`);
  return row ?? { onShoutout: true, budgetReminder: true };
}

export async function setEmailPreferences(
  db: Db,
  userId: string,
  preferences: EmailPreferences,
): Promise<void> {
  await db.execute(sql`
    UPDATE users
    SET email_on_shoutout = ${preferences.onShoutout},
      email_budget_reminder = ${preferences.budgetReminder}, updated_at = now()
    WHERE id = ${userId}`);
}
