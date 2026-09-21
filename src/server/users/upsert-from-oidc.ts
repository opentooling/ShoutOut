import type { Db } from "@/lib/db";
import { sql } from "@/lib/sql";

export interface OidcProfile {
  sub?: string | null;
  email?: string | null;
  name?: string | null;
  preferred_username?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  picture?: string | null;
}

export interface UserRecord {
  id: string;
  keycloakId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const USER_COLUMNS = sql`
  id, keycloak_id AS "keycloakId", email, name, avatar_url AS "avatarUrl", active,
  last_login_at AS "lastLoginAt", created_at AS "createdAt", updated_at AS "updatedAt"`;

export function displayName(profile: OidcProfile): string {
  const fromParts = [profile.given_name, profile.family_name].filter(Boolean).join(" ");
  return profile.name || fromParts || profile.preferred_username || profile.email || "Unknown";
}

/**
 * Finds the local user for a Keycloak account. Falls back to email so a user
 * whose Keycloak id changed (e.g. realm re-created) keeps their history.
 */
export function findByKeycloakIdOrEmail(db: Db, keycloakId: string, email: string) {
  return db.one<{ id: string }>(sql`
    SELECT id FROM users
    WHERE keycloak_id = ${keycloakId} OR email = ${email}
    ORDER BY (keycloak_id = ${keycloakId}) DESC
    LIMIT 1`);
}

/** Creates or refreshes the local user record for someone who just signed in. */
export async function upsertUserFromOidc(db: Db, profile: OidcProfile, now = new Date()) {
  const { sub, email: rawEmail } = profile;
  if (!sub || !rawEmail) {
    const missing = [!sub && "sub", !rawEmail && "email"].filter(Boolean);
    throw new Error(
      `Keycloak did not send the ${missing.join(" and ")} claim${missing.length > 1 ? "s" : ""}. ` +
        "ShoutOut needs both: give the user an email address in Keycloak (or the directory it " +
        "syncs from) and make sure the client has the 'email' client scope.",
    );
  }
  const email = rawEmail.toLowerCase();
  const name = displayName(profile);
  const avatarUrl = profile.picture ?? null;
  const existing = await findByKeycloakIdOrEmail(db, sub, email);
  if (existing) {
    return (await db.one<UserRecord>(sql`
      UPDATE users SET keycloak_id = ${sub}, email = ${email}, name = ${name},
        avatar_url = ${avatarUrl}, active = true, last_login_at = ${now}, updated_at = now()
      WHERE id = ${existing.id}
      RETURNING ${USER_COLUMNS}`))!;
  }
  return (await db.one<UserRecord>(sql`
    INSERT INTO users (keycloak_id, email, name, avatar_url, active, last_login_at)
    VALUES (${sub}, ${email}, ${name}, ${avatarUrl}, true, ${now})
    RETURNING ${USER_COLUMNS}`))!;
}
