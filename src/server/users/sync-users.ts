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

/** Service accounts and users without an email can't be recognised. */
export function isSyncable(user: KeycloakUser): boolean {
  return Boolean(user.email) && !user.username.startsWith("service-account-");
}

export async function syncUsers(db: Db, users: KeycloakUser[]): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, deactivated: 0, skipped: 0 };
  const seen: string[] = [];

  for (const user of users) {
    if (!isSyncable(user)) {
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

export async function runKeycloakSync(
  db: Db,
  credentials: KeycloakClientCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncResult> {
  const users = await fetchAllUsers({ credentials }, fetchImpl);
  return syncUsers(db, users);
}
