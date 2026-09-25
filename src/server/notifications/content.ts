import type { CardTone } from "@/components/cards/designs";
import type { Db } from "@/lib/db";
import { sql } from "@/lib/sql";
import { getBudget } from "../shoutouts/budget";
import { quarterBounds } from "../shoutouts/quarter";
import type { ModerationStatus, Visibility } from "../types";
import type { EmailConfig } from "./email-config";
import type { OutboxItem } from "./outbox";
import { budgetReminderEmail, shoutoutReceivedEmail, type EmailContent } from "./templates";

/** A ready-to-send email, or why the notification no longer applies. */
export type Prepared = { to: string; content: EmailContent } | { skip: string };

interface Recipient {
  name: string;
  email: string;
  active: boolean;
  emailOnShoutout: boolean;
  emailBudgetReminder: boolean;
}

function loadRecipient(db: Db, userId: string) {
  return db.one<Recipient>(sql`
    SELECT name, email, active, email_on_shoutout AS "emailOnShoutout",
      email_budget_reminder AS "emailBudgetReminder"
    FROM users WHERE id = ${userId}`);
}

async function prepareShoutout(
  db: Db,
  item: OutboxItem,
  recipient: Recipient,
  config: EmailConfig,
): Promise<Prepared> {
  if (!recipient.emailOnShoutout) return { skip: "turned off shoutout emails" };
  const shoutout = await db.one<{
    senderName: string;
    cardTitle: string;
    cardTagline: string;
    cardTone: CardTone;
    valueName: string;
    message: string;
    visibility: Visibility;
    moderationStatus: ModerationStatus;
    deleted: boolean;
    recipientCount: number;
  }>(sql`
    SELECT sender.name AS "senderName", c.title AS "cardTitle", c.tagline AS "cardTagline",
      c.tone AS "cardTone", v.name AS "valueName", s.message, s.visibility,
      s.moderation_status AS "moderationStatus", s.deleted_at IS NOT NULL AS deleted,
      (SELECT COUNT(*)::int FROM shoutout_recipients r WHERE r.shoutout_id = s.id) AS "recipientCount"
    FROM shoutouts s
    JOIN users sender ON sender.id = s.sender_id
    JOIN cards c ON c.id = s.card_id
    JOIN company_values v ON v.id = s.value_id
    WHERE s.id = ${item.shoutoutId}`);
  // Deleting a shoutout keeps the row (and so this notification); both cases mean "don't send".
  if (!shoutout || shoutout.deleted) return { skip: "shoutout was deleted" };
  if (shoutout.moderationStatus !== "VISIBLE") return { skip: "shoutout is hidden" };
  return {
    to: recipient.email,
    content: shoutoutReceivedEmail(
      {
        shoutoutId: item.shoutoutId!,
        recipientId: item.userId,
        recipientName: recipient.name,
        senderName: shoutout.senderName,
        cardTitle: shoutout.cardTitle,
        cardTagline: shoutout.cardTagline,
        cardTone: shoutout.cardTone,
        valueName: shoutout.valueName,
        message: shoutout.message,
        visibility: shoutout.visibility,
        otherRecipients: shoutout.recipientCount - 1,
      },
      config.appUrl,
    ),
  };
}

async function prepareReminder(
  db: Db,
  item: OutboxItem,
  recipient: Recipient,
  config: EmailConfig,
  allowance: number,
  now: Date,
): Promise<Prepared> {
  if (!recipient.emailBudgetReminder) return { skip: "turned off budget reminders" };
  // A reminder still waiting after its quarter ended (e.g. a long mail outage) is pointless.
  if (quarterBounds(item.createdAt).end <= now) return { skip: "the quarter has ended" };
  const budget = await getBudget(db, item.userId, allowance, now);
  if (budget.remaining === 0) return { skip: "budget already used" };
  return {
    to: recipient.email,
    content: budgetReminderEmail(
      {
        recipientId: item.userId,
        recipientName: recipient.name,
        remaining: budget.remaining,
        allowance,
        resetsAt: budget.resetsAt,
        reminderDays: config.reminderDays,
      },
      config.appUrl,
    ),
  };
}

/**
 * Builds the email for a queued notification from the current data, so edits
 * made before it goes out are included and anything that no longer applies is
 * skipped.
 */
export async function prepareEmail(
  db: Db,
  item: OutboxItem,
  config: EmailConfig,
  allowance: number,
  now: Date,
): Promise<Prepared> {
  const recipient = await loadRecipient(db, item.userId);
  if (!recipient?.active) return { skip: "person is no longer active" };
  return item.kind === "SHOUTOUT_RECEIVED"
    ? prepareShoutout(db, item, recipient, config)
    : prepareReminder(db, item, recipient, config, allowance, now);
}
