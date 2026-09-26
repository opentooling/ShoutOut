import type { AppConfig } from "@/lib/config";
import type { Db } from "@/lib/db";
import { sql } from "@/lib/sql";
import { DomainError } from "../errors";
import { enqueueShoutoutEmails } from "../notifications/outbox";
import { getBudget, getPointsBudget } from "./budget";
import { SHOUTOUT_COLUMNS, type ShoutoutRecord } from "./record";
import type { SendShoutoutInput } from "./validation";

export async function sendShoutout(
  db: Db,
  senderId: string,
  input: Omit<SendShoutoutInput, "points"> & { points?: number },
  config: Pick<AppConfig, "quarterlyBudget"> &
    Partial<Pick<AppConfig, "budgetEnabled" | "points">> & {
      /** Queue emails to the recipients this long after sending; null or absent when email is off. */
      emailDelayMs?: number | null;
    },
  now = new Date(),
): Promise<ShoutoutRecord> {
  const recipientIds = [...new Set(input.recipientIds)];
  const points = input.points ?? 0;
  if (points > 0 && !config.points?.enabled) {
    throw new DomainError("INVALID_POINTS", "Points can't be given", "points");
  }
  if (points > 0 && !config.points!.choices.includes(points)) {
    throw new DomainError(
      "INVALID_POINTS",
      `Pick one of ${config.points!.choices.join(", ")} points`,
      "points",
    );
  }
  if (recipientIds.includes(senderId)) {
    throw new DomainError(
      "SELF_RECIPIENT",
      "You can't send a shoutout to yourself",
      "recipientIds",
    );
  }

  return db.transaction(async (tx) => {
    // Serialise sends per sender so concurrent requests can't overspend the budget.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${senderId}))`);

    const [card, value, recipients] = await Promise.all([
      tx.one(sql`SELECT id FROM cards WHERE id = ${input.cardId} AND active`),
      tx.one(sql`SELECT id FROM company_values WHERE id = ${input.valueId} AND active`),
      tx.rows(sql`SELECT id FROM users WHERE id = ANY(${recipientIds}::text[]) AND active`),
    ]);
    if (!card) throw new DomainError("CARD_NOT_FOUND", "That card isn't available", "cardId");
    if (!value) {
      throw new DomainError("VALUE_NOT_FOUND", "That value isn't available", "valueId");
    }
    if (recipients.length !== recipientIds.length) {
      throw new DomainError(
        "RECIPIENT_NOT_FOUND",
        "Some of the people you picked can't receive shoutouts",
        "recipientIds",
      );
    }

    if (config.budgetEnabled ?? true) {
      const budget = await getBudget(tx, senderId, config.quarterlyBudget, now);
      if (recipientIds.length > budget.remaining) {
        throw new DomainError(
          "BUDGET_EXCEEDED",
          budget.remaining === 0
            ? "You've used all your shoutouts this quarter"
            : `You only have ${budget.remaining} shoutout${budget.remaining === 1 ? "" : "s"} left this quarter`,
          "recipientIds",
        );
      }
    }
    if (points > 0) {
      const pointsBudget = await getPointsBudget(tx, senderId, config.points!.quarterlyBudget, now);
      const cost = points * recipientIds.length;
      if (cost > pointsBudget.remaining) {
        throw new DomainError(
          "POINTS_EXCEEDED",
          `That needs ${cost} points, but you only have ${pointsBudget.remaining} left this quarter`,
          "points",
        );
      }
    }

    const shoutout = (await tx.one<ShoutoutRecord>(sql`
      INSERT INTO shoutouts (sender_id, card_id, value_id, message, visibility, points, created_at, updated_at)
      VALUES (${senderId}, ${input.cardId}, ${input.valueId}, ${input.message}, ${input.visibility}, ${points}, ${now}, ${now})
      RETURNING ${SHOUTOUT_COLUMNS}`))!;
    await tx.execute(sql`
      INSERT INTO shoutout_recipients (shoutout_id, user_id)
      SELECT ${shoutout.id}, unnest(${recipientIds}::text[])`);
    if (config.emailDelayMs != null) {
      await enqueueShoutoutEmails(
        tx,
        shoutout.id,
        recipientIds,
        new Date(now.getTime() + config.emailDelayMs),
      );
    }
    return shoutout;
  });
}
