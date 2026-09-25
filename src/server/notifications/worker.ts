import { loadConfig } from "@/lib/config";
import { getDb, type Db } from "@/lib/db";
import { createLogger, type Logger } from "@/lib/logger";
import { prepareEmail } from "./content";
import { emailConfigFromEnv, type EmailConfig } from "./email-config";
import { createSmtpMailer, smtpHint, type Mailer } from "./mailer";
import {
  claimDue,
  enqueueBudgetReminders,
  markFailed,
  markSent,
  markSkipped,
  purgeFinished,
  type OutboxItem,
} from "./outbox";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Attempts before giving up; with the backoff below that is about 3.5 hours. */
export const MAX_ATTEMPTS = 8;
const BATCH_SIZE = 20;
/** Batches per tick, so a big send (reminders for everyone) drains without waiting between batches. */
const MAX_BATCHES = 50;
const KEEP_FINISHED_MS = 90 * DAY;

export interface SenderDeps {
  db: Db;
  mailer: Mailer;
  config: EmailConfig;
  /** Quarterly budget, for the reminder's numbers. */
  allowance: number;
  log: Logger;
}

export interface DeliveryResult {
  sent: number;
  skipped: number;
  failed: number;
}

/** 1, 2, 4 … minutes after each failed attempt, capped at an hour. */
export function retryDelayMs(attempt: number): number {
  return Math.min(HOUR, MINUTE * 2 ** (attempt - 1));
}

async function deliverOne(
  deps: SenderDeps,
  tx: Db,
  item: OutboxItem,
  now: Date,
  result: DeliveryResult,
) {
  const fields = { outboxId: item.id, kind: item.kind, userId: item.userId };
  try {
    const prepared = await prepareEmail(tx, item, deps.config, deps.allowance, now);
    if ("skip" in prepared) {
      await markSkipped(tx, item.id, prepared.skip);
      deps.log.debug("Email skipped", { ...fields, reason: prepared.skip });
      result.skipped++;
      return;
    }
    await deps.mailer.send(prepared.to, prepared.content);
  } catch (error) {
    const attempt = item.attempts + 1;
    const retryAt = attempt < MAX_ATTEMPTS ? new Date(now.getTime() + retryDelayMs(attempt)) : null;
    await markFailed(tx, item.id, error instanceof Error ? error.message : String(error), retryAt);
    const details = { ...fields, attempt, retryAt, error, hint: smtpHint(error) };
    if (retryAt) deps.log.warn("Email failed; will retry", details);
    else deps.log.error("Email failed; giving up", details);
    result.failed++;
    return;
  }
  await markSent(tx, item.id, now);
  deps.log.info("Email sent", fields);
  result.sent++;
}

/**
 * Sends one batch of due notifications. The rows stay locked until the batch
 * commits, so another replica can't send them twice. Returns what happened and
 * whether the batch was full (there may be more).
 */
export async function deliverBatch(
  deps: SenderDeps,
  now = new Date(),
  batchSize = BATCH_SIZE,
): Promise<DeliveryResult & { full: boolean }> {
  return deps.db.transaction(async (tx) => {
    const items = await claimDue(tx, now, batchSize);
    const result: DeliveryResult = { sent: 0, skipped: 0, failed: 0 };
    for (const item of items) {
      await deliverOne(deps, tx, item, now, result);
    }
    return { ...result, full: items.length === batchSize };
  });
}

/** Queues reminders when due, cleans up, then sends everything that is due. */
export async function runSender(
  deps: SenderDeps,
  { now = () => new Date(), housekeeping = true, batchSize = BATCH_SIZE } = {},
): Promise<DeliveryResult> {
  if (housekeeping) {
    const queued = await enqueueBudgetReminders(deps.db, now(), deps.config.reminderDays);
    if (queued > 0) deps.log.info("Budget reminders queued", { count: queued });
    await purgeFinished(deps.db, new Date(now().getTime() - KEEP_FINISHED_MS));
  }
  const total: DeliveryResult = { sent: 0, skipped: 0, failed: 0 };
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { full, ...result } = await deliverBatch(deps, now(), batchSize);
    total.sent += result.sent;
    total.skipped += result.skipped;
    total.failed += result.failed;
    if (!full) break;
  }
  return total;
}

type Env = Record<string, string | undefined>;

/**
 * Starts the background email sender when SMTP is configured: checks the SMTP
 * connection once and logs the outcome, then sends due notifications every
 * `intervalMs` and does housekeeping (reminders, cleanup) every
 * `housekeepingMs`. Returns a stop function, or null when email is off.
 */
export async function startEmailNotifications({
  env = process.env,
  intervalMs = 30_000,
  housekeepingMs = 10 * MINUTE,
  db = getDb,
  mailer = createSmtpMailer,
  log = createLogger("notifications"),
}: {
  env?: Env;
  intervalMs?: number;
  housekeepingMs?: number;
  db?: () => Db;
  mailer?: (config: EmailConfig) => Mailer;
  log?: Logger;
} = {}): Promise<(() => void) | null> {
  let config: EmailConfig | null;
  let allowance: number;
  try {
    config = emailConfigFromEnv(env);
    allowance = loadConfig(env).quarterlyBudget;
  } catch (error) {
    log.error("Email notifications are off: invalid settings", { error });
    return null;
  }
  if (!config) {
    log.info("Email notifications are off", { reason: "SMTP_HOST is not set" });
    return null;
  }

  const deps: SenderDeps = {
    db: db(),
    mailer: mailer(config),
    config,
    allowance,
    log,
  };
  log.info("Email notifications are on", {
    host: config.host,
    port: config.port,
    tls: config.tls,
    smtpUser: config.user ?? null,
    ehloName: config.ehloName ?? null,
    from: config.from,
    appUrl: config.appUrl,
    delaySeconds: config.delayMs / 1000,
    reminderDaysBeforeReset: config.reminderDays,
  });
  try {
    await deps.mailer.verify();
    log.info("SMTP server accepted the connection", { host: config.host, port: config.port });
  } catch (error) {
    log.warn("Could not connect to the SMTP server; emails wait in the queue and are retried", {
      host: config.host,
      port: config.port,
      error,
      hint: smtpHint(error),
    });
  }

  let running = false;
  let lastHousekeeping = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const housekeeping = Date.now() - lastHousekeeping >= housekeepingMs;
      if (housekeeping) lastHousekeeping = Date.now();
      await runSender(deps, { housekeeping });
    } catch (error) {
      log.error("Email sender run failed", { error });
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
