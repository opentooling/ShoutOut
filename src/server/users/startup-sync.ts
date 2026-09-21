import { getDb } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { runKeycloakSync, syncCredentialsFromEnv } from "./sync-users";

const log = createLogger("user-sync");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Syncs people from Keycloak once when the server starts, so everyone can be
 * recognised straight after a deploy. Retries while Keycloak is still starting.
 */
export async function startupSync({
  attempts = 10,
  delayMs = 15_000,
  run = runKeycloakSync,
  env = process.env,
}: {
  attempts?: number;
  delayMs?: number;
  run?: typeof runKeycloakSync;
  env?: Record<string, string | undefined>;
} = {}): Promise<boolean> {
  const credentials = syncCredentialsFromEnv(env);
  if (!credentials || env.SHOUTOUT_SYNC_ON_STARTUP === "false") {
    log.info("Startup sync skipped", {
      reason: credentials
        ? "SHOUTOUT_SYNC_ON_STARTUP=false"
        : "Keycloak client settings are missing",
    });
    return false;
  }
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await run(getDb(), credentials);
      log.info("Startup sync complete", { ...result });
      return true;
    } catch (error) {
      log.warn("Startup sync attempt failed", { attempt, attempts, error });
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  log.error("Startup sync gave up; people appear when they sign in or the hourly sync succeeds", {
    attempts,
  });
  return false;
}
