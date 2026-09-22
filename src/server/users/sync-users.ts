import type { Db } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { sql } from "@/lib/sql";
import { fetchAllUsers, type KeycloakClientCredentials, type KeycloakUser } from "./keycloak-admin";
import { displayName, findByKeycloakIdOrEmail } from "./upsert-from-oidc";

const log = createLogger("user-sync");

export interface SyncResult {
  created: number;
  updated: number;
  deactivated: number;
  skipped: number;
}

/** Matches usernames formatted as firstname.lastname (e.g. john.doe, jane.smith-jones). */
export const FIRSTNAME_LASTNAME_PATTERN =
  /^[a-zA-Z0-9]+[a-zA-Z0-9._-]*\.[a-zA-Z0-9]+[a-zA-Z0-9._-]*$/;

export interface IsSyncableOptions {
  pattern?: RegExp;
  enabledOnly?: boolean;
}

/** Service accounts, users without email, disabled users (if enabledOnly), and accounts not matching pattern are skipped. */
export function isSyncable(user: KeycloakUser, options?: RegExp | IsSyncableOptions): boolean {
  const pattern = options instanceof RegExp ? options : options?.pattern;
  const enabledOnly = !(options instanceof RegExp) && options?.enabledOnly;

  if (!user.email || user.username.startsWith("service-account-")) return false;
  if (enabledOnly && !user.enabled) return false;
  if (pattern && !pattern.test(user.username)) return false;
  return true;
}

export async function syncUsers(
  db: Db,
  users: KeycloakUser[],
  options?: RegExp | IsSyncableOptions,
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, deactivated: 0, skipped: 0 };
  const seen: string[] = [];

  for (const user of users) {
    if (!isSyncable(user, options)) {
      result.skipped++;
      continue;
    }
    seen.push(user.id);
    const email = user.email!.toLowerCase();
    const name = displayName({
      given_name: user.firstName,
      family_name: user.lastName,
      preferred_username: user.username,
    });
    try {
      const existing = await findByKeycloakIdOrEmail(db, user.id, email);
      if (existing) {
        await db.execute(sql`
          UPDATE users SET keycloak_id = ${user.id}, email = ${email}, name = ${name},
            active = ${user.enabled}, updated_at = now()
          WHERE id = ${existing.id}`);
        result.updated++;
      } else {
        await db.execute(sql`
          INSERT INTO users (keycloak_id, email, name, active)
          VALUES (${user.id}, ${email}, ${name}, ${user.enabled})`);
        result.created++;
      }
    } catch (error) {
      // e.g. an email clash with another user; keep syncing everyone else.
      log.warn("Skipped a Keycloak user", { keycloakId: user.id, username: user.username, error });
      result.skipped++;
    }
  }

  // Never deactivate everyone because Keycloak returned an empty list.
  if (seen.length > 0) {
    result.deactivated = await db.execute(sql`
      UPDATE users SET active = false, updated_at = now()
      WHERE active AND keycloak_id <> ALL(${seen}::text[])`);
  }
  return result;
}

export function syncCredentialsFromEnv(
  env: Record<string, string | undefined> = process.env,
): KeycloakClientCredentials | null {
  const { AUTH_KEYCLOAK_ISSUER, AUTH_KEYCLOAK_ID, AUTH_KEYCLOAK_SECRET } = env;
  if (!AUTH_KEYCLOAK_ISSUER || !AUTH_KEYCLOAK_ID || !AUTH_KEYCLOAK_SECRET) return null;
  return {
    issuer: AUTH_KEYCLOAK_ISSUER,
    clientId: AUTH_KEYCLOAK_ID,
    clientSecret: AUTH_KEYCLOAK_SECRET,
  };
}

export function syncUsernamePatternFromEnv(
  env: Record<string, string | undefined> = process.env,
): RegExp | undefined {
  const raw = env.SHOUTOUT_SYNC_USERNAME_PATTERN;
  if (!raw) return undefined;
  if (raw === "firstname.lastname") return FIRSTNAME_LASTNAME_PATTERN;
  return new RegExp(raw);
}

export function syncEnabledOnlyFromEnv(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.SHOUTOUT_SYNC_ENABLED_ONLY === "true";
}

export async function runKeycloakSync(
  db: Db,
  credentials: KeycloakClientCredentials,
  fetchImpl: typeof fetch = fetch,
  syncOptions?: IsSyncableOptions,
  env: Record<string, string | undefined> = process.env,
): Promise<SyncResult> {
  const enabledOnly = syncOptions?.enabledOnly ?? syncEnabledOnlyFromEnv(env);
  const pattern = syncOptions?.pattern ?? syncUsernamePatternFromEnv(env);
  const users = await fetchAllUsers(
    { credentials, enabled: enabledOnly ? true : undefined },
    fetchImpl,
  );
  return syncUsers(db, users, { pattern, enabledOnly });
}
