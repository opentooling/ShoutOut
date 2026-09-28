import type { CardTone } from "@/components/cards/designs";
import type { Db } from "@/lib/db";
import { sql } from "@/lib/sql";
import type { AppConfig } from "@/lib/config";
import { getBudget, getPointsBudget } from "../shoutouts/budget";
import { quarterBounds } from "../shoutouts/quarter";
import type { ModerationStatus, Visibility } from "../types";
import type { EmailConfig } from "./email-config";
import type { OutboxItem } from "./outbox";
import { budgetReminderEmail, shoutoutReceivedEmail, type EmailContent } from "./templates";

/** The budgets in use, for the reminder's numbers. */
export type BudgetSettings = Pick<AppConfig, "budgetEnabled" | "quarterlyBudget" | "points">;

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
    valueNames: string[];
    message: string;
    visibility: Visibility;
    points: number;
    moderationStatus: ModerationStatus;
    deleted: boolean;
    recipientCount: number;
  }>(sql`
    SELECT sender.name AS "senderName", c.title AS "cardTitle", c.tagline AS "cardTagline",
      c.tone AS "cardTone", s.message, s.visibility, s.points,
      s.moderation_status AS "moderationStatus", s.deleted_at IS NOT NULL AS deleted,
      (SELECT COUNT(*)::int FROM shoutout_recipients r WHERE r.shoutout_id = s.id) AS "recipientCount",
      ARRAY(SELECT cv.name FROM shoutout_values sv JOIN company_values cv ON cv.id = sv.value_id
        WHERE sv.shoutout_id = s.id ORDER BY sv.position) AS "valueNames"
    FROM shoutouts s
    JOIN users sender ON sender.id = s.sender_id
    JOIN cards c ON c.id = s.card_id
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
        valueNames: shoutout.valueNames,
        message: shoutout.message,
        visibility: shoutout.visibility,
        otherRecipients: shoutout.recipientCount - 1,
        points: shoutout.points,
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
  budgets: BudgetSettings,
  now: Date,
): Promise<Prepared> {
  if (!recipient.emailBudgetReminder) return { skip: "turned off budget reminders" };
  // A reminder still waiting after its quarter ended (e.g. a long mail outage) is pointless.
  if (quarterBounds(item.createdAt).end <= now) return { skip: "the quarter has ended" };
  if (!budgets.budgetEnabled && !budgets.points.enabled) return { skip: "no budget in use" };
  const [shoutouts, points] = await Promise.all([
    budgets.budgetEnabled ? getBudget(db, item.userId, budgets.quarterlyBudget, now) : null,
    budgets.points.enabled
      ? getPointsBudget(db, item.userId, budgets.points.quarterlyBudget, now)
      : null,
  ]);
  // Points go with a shoutout, so with no shoutouts left there is nothing to remind about.
  const nothingLeft = shoutouts ? shoutouts.remaining === 0 : points!.remaining === 0;
  if (nothingLeft) return { skip: "budget already used" };
  const left = (budget: typeof shoutouts) =>
    budget && budget.remaining > 0
      ? { remaining: budget.remaining, allowance: budget.allowance }
      : null;
  return {
    to: recipient.email,
    content: budgetReminderEmail(
      {
        recipientId: item.userId,
        recipientName: recipient.name,
        shoutouts: left(shoutouts),
        points: left(points),
        resetsAt: quarterBounds(now).end,
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
  budgets: BudgetSettings,
  now: Date,
): Promise<Prepared> {
  const recipient = await loadRecipient(db, item.userId);
  if (!recipient?.active) return { skip: "person is no longer active" };
  return item.kind === "SHOUTOUT_RECEIVED"
    ? prepareShoutout(db, item, recipient, config)
    : prepareReminder(db, item, recipient, config, budgets, now);
}
