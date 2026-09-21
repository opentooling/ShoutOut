import type { NextAuthConfig } from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import type { Db } from "@/lib/db";
import { createLogger, type Logger } from "@/lib/logger";
import { isPublicPath } from "./public-paths";
import { ROLES, resolveRoles, roleConfigFromEnv, type RoleConfig } from "./roles";
import { upsertUserFromOidc, type OidcProfile } from "../users/upsert-from-oidc";

export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/** Routes Auth.js's own logging through ShoutOut's structured logger. */
export function authLogger(log: Logger): NonNullable<NextAuthConfig["logger"]> {
  return {
    error(error) {
      log.error("Auth.js error", { error });
    },
    warn(code) {
      log.warn("Auth.js warning", {
        warning: code,
        docs: `https://warnings.authjs.dev#${code}`,
      });
    },
    debug(message, metadata) {
      log.debug(`Auth.js: ${message}`, { metadata });
    },
  };
}

export function buildAuthConfig(
  getDb: () => Db,
  {
    log = createLogger("auth"),
    roleConfig = roleConfigFromEnv(),
  }: { log?: Logger; roleConfig?: RoleConfig } = {},
): NextAuthConfig {
  return {
    trustHost: true,
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
    // Failed sign-ins come back to /signin?error=<type> with a readable message.
    pages: { signIn: "/signin", error: "/signin" },
    // Auth.js debug output (OAuth requests, responses, token claims) at LOG_LEVEL=debug.
    debug: log.isEnabled("debug"),
    logger: authLogger(log),
    providers: [
      Keycloak({
        clientId: process.env.AUTH_KEYCLOAK_ID,
        clientSecret: process.env.AUTH_KEYCLOAK_SECRET,
        issuer: process.env.AUTH_KEYCLOAK_ISSUER,
      }),
    ],
    callbacks: {
      authorized({ request, auth }) {
        return isPublicPath(request.nextUrl.pathname) || Boolean(auth?.user);
      },
      async jwt({ token, account, profile }) {
        // `account` and `profile` are only present on the sign-in request.
        if (!account || !profile) return token;
        const claims = profile as OidcProfile & Record<string, unknown>;
        const who = {
          sub: claims.sub,
          username: claims.preferred_username,
          email: claims.email,
        };
        const { roles, clientRoles, clientsWithRoles } = resolveRoles(
          { idToken: claims, accessToken: account.access_token },
          roleConfig,
        );
        try {
          const user = await upsertUserFromOidc(getDb(), claims);
          token.userId = user.id;
          token.name = user.name;
          token.email = user.email;
          token.roles = roles;
          token.idToken = account.id_token;
        } catch (error) {
          log.error("Sign-in failed while saving the user", {
            ...who,
            claimsPresent: Object.keys(claims).sort(),
            error,
          });
          throw error;
        }
        log.info("Signed in", {
          ...who,
          admin: roles.includes(ROLES.admin),
          rolesClient: roleConfig.clientId,
          adminRole: roleConfig.adminRole,
          clientRoles,
        });
        if (clientRoles.length === 0 && clientsWithRoles.length > 0) {
          log.debug("No client roles for the configured roles client", {
            rolesClient: roleConfig.clientId,
            clientsWithRoles,
          });
        }
        return token;
      },
      session({ session, token }) {
        session.user.id = token.userId as string;
        session.user.roles = (token.roles as string[] | undefined) ?? [ROLES.user];
        return session;
      },
    },
  };
}
