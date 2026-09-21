/** Roles inside ShoutOut. Everyone who signs in is a user; admin comes from Keycloak. */
export const ROLES = {
  user: "shoutout-user",
  admin: "shoutout-admin",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export interface RoleConfig {
  /** Keycloak client whose client roles are checked (defaults to ShoutOut's own client). */
  clientId: string;
  /** Client role that grants admin. */
  adminRole: string;
}

export const DEFAULT_ADMIN_ROLE = "admin";

export function roleConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): RoleConfig {
  return {
    clientId: env.SHOUTOUT_ROLES_CLIENT_ID?.trim() || env.AUTH_KEYCLOAK_ID?.trim() || "",
    adminRole: env.SHOUTOUT_ADMIN_ROLE?.trim() || DEFAULT_ADMIN_ROLE,
  };
}

type Claims = Record<string, unknown>;

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Reads the payload of a JWT without verifying it. Only for tokens the server
 * has just received from Keycloak's token endpoint over its own connection.
 */
export function decodeJwtPayload(token: string | null | undefined): Claims | null {
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Claims)
      : null;
  } catch {
    return null;
  }
}

/** `resource_access[clientId].roles` from one set of claims. */
function clientRolesIn(claims: Claims | null | undefined, clientId: string): string[] {
  const access = claims?.resource_access as Record<string, { roles?: unknown }> | undefined;
  return stringArray(access?.[clientId]?.roles);
}

export interface ResolvedRoles {
  roles: Role[];
  /** Client roles found for the configured client, for logging. */
  clientRoles: string[];
  /** Clients that had roles in the tokens, to spot a misconfigured client id. */
  clientsWithRoles: string[];
}

/**
 * Everyone who signs in gets the user role, so nobody needs a Keycloak role or
 * directory group just to use ShoutOut. Admin needs the configured client role,
 * looked for in the ID token and the access token (Keycloak's default "roles"
 * client scope only adds `resource_access` to the access token).
 */
export function resolveRoles(
  { idToken, accessToken }: { idToken?: Claims | null; accessToken?: string | null },
  config: RoleConfig,
): ResolvedRoles {
  const sources = [idToken, decodeJwtPayload(accessToken)];
  const clientRoles = [
    ...new Set(sources.flatMap((claims) => clientRolesIn(claims, config.clientId))),
  ];
  const clientsWithRoles = [
    ...new Set(
      sources.flatMap((claims) =>
        Object.keys((claims?.resource_access as Record<string, unknown> | undefined) ?? {}),
      ),
    ),
  ];
  const roles: Role[] = [ROLES.user];
  if (config.clientId && clientRoles.includes(config.adminRole)) roles.push(ROLES.admin);
  return { roles, clientRoles, clientsWithRoles };
}

export function isAdmin(roles: readonly string[] | undefined): boolean {
  return roles?.includes(ROLES.admin) ?? false;
}

/** Analytics are for admins unless configured for everyone. */
export function canViewAnalytics(
  roles: readonly string[] | undefined,
  visibility: "admins" | "everyone",
): boolean {
  return visibility === "everyone" || isAdmin(roles);
}
