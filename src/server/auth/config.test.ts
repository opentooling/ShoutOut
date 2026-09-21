import type { Account, Profile, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";

const upsertUserFromOidc = vi.fn();
vi.mock("../users/upsert-from-oidc", () => ({ upsertUserFromOidc }));

const { authLogger, buildAuthConfig, SESSION_MAX_AGE_SECONDS } = await import("./config");
const { createLogger } = await import("@/lib/logger");

const roleConfig = { clientId: "shoutout-web", adminRole: "admin" };

function recorder(level = "debug") {
  const lines: Record<string, unknown>[] = [];
  const push = (line: string) => lines.push(JSON.parse(line) as Record<string, unknown>);
  const log = createLogger("auth", { env: { LOG_LEVEL: level }, sink: { out: push, err: push } });
  return { log, lines };
}

const accessToken = (roles: string[], client = "shoutout-web") =>
  `h.${Buffer.from(JSON.stringify({ resource_access: { [client]: { roles } } })).toString("base64url")}.s`;

function fakeDb() {
  upsertUserFromOidc.mockReset();
  upsertUserFromOidc.mockResolvedValue({
    id: "user-1",
    name: "Alice Admin",
    email: "alice@example.com",
  });
  return { db: { fake: true } as unknown as Db, upsert: upsertUserFromOidc };
}

function request(pathname: string) {
  return { nextUrl: new URL(`http://localhost${pathname}`) } as unknown as NextRequest;
}

describe("buildAuthConfig", () => {
  it("configures a Keycloak provider with JWT sessions", () => {
    process.env.AUTH_KEYCLOAK_ISSUER = "http://auth.localtest.me/realms/shoutout";
    const config = buildAuthConfig(() => fakeDb().db);
    expect(config.providers).toHaveLength(1);
    expect(config.session).toEqual({ strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS });
    expect(config.pages).toEqual({ signIn: "/signin", error: "/signin" });
  });

  it("turns on Auth.js debug output only at debug level", () => {
    expect(buildAuthConfig(() => fakeDb().db, { log: recorder("debug").log }).debug).toBe(true);
    expect(buildAuthConfig(() => fakeDb().db, { log: recorder("info").log }).debug).toBe(false);
  });

  describe("authorized", () => {
    const { authorized } = buildAuthConfig(() => fakeDb().db).callbacks!;
    const session = { user: { id: "u" } } as Session;

    it("allows public paths without a session", () => {
      expect(authorized!({ request: request("/signin"), auth: null })).toBe(true);
    });

    it("blocks protected paths without a session", () => {
      expect(authorized!({ request: request("/"), auth: null })).toBe(false);
      expect(authorized!({ request: request("/"), auth: {} as Session })).toBe(false);
    });

    it("allows protected paths with a session", () => {
      expect(authorized!({ request: request("/"), auth: session })).toBe(true);
    });
  });

  describe("jwt", () => {
    const signIn = (
      jwt: NonNullable<ReturnType<typeof buildAuthConfig>["callbacks"]>["jwt"],
      roles: string[],
    ) =>
      jwt!({
        token: {} as JWT,
        account: { id_token: "id-token", access_token: accessToken(roles) } as Account,
        profile: {
          sub: "kc-1",
          email: "alice@example.com",
          preferred_username: "alice",
        } as Profile,
        user: {} as never,
      });

    it("upserts the user and grants admin from the client role", async () => {
      const { db, upsert } = fakeDb();
      const { log, lines } = recorder();
      const { jwt } = buildAuthConfig(() => db, { log, roleConfig }).callbacks!;
      const token = await signIn(jwt, ["admin"]);
      expect(upsert).toHaveBeenCalledOnce();
      expect(token).toMatchObject({
        userId: "user-1",
        name: "Alice Admin",
        email: "alice@example.com",
        roles: ["shoutout-user", "shoutout-admin"],
        idToken: "id-token",
      });
      expect(lines).toEqual([
        expect.objectContaining({
          level: "info",
          msg: "Signed in",
          sub: "kc-1",
          username: "alice",
          admin: true,
          rolesClient: "shoutout-web",
          clientRoles: ["admin"],
        }),
      ]);
    });

    it("makes everyone else a user, and says where roles were found", async () => {
      const { db } = fakeDb();
      const { log, lines } = recorder();
      const { jwt } = buildAuthConfig(() => db, {
        log,
        roleConfig: { ...roleConfig, clientId: "other-client" },
      }).callbacks!;
      expect((await signIn(jwt, ["admin"]))?.roles).toEqual(["shoutout-user"]);
      expect(lines.map((l) => l.msg)).toEqual([
        "Signed in",
        "No client roles for the configured roles client",
      ]);
      expect(lines[1]).toMatchObject({
        rolesClient: "other-client",
        clientsWithRoles: ["shoutout-web"],
      });
    });

    it("logs why saving the user failed, then fails the sign-in", async () => {
      const { db, upsert } = fakeDb();
      upsert.mockRejectedValue(new Error("Keycloak did not send the email claim."));
      const { log, lines } = recorder();
      const { jwt } = buildAuthConfig(() => db, { log, roleConfig }).callbacks!;
      await expect(signIn(jwt, [])).rejects.toThrow(/email claim/);
      expect(lines).toEqual([
        expect.objectContaining({
          level: "error",
          msg: "Sign-in failed while saving the user",
          claimsPresent: ["email", "preferred_username", "sub"],
          error: expect.objectContaining({ message: "Keycloak did not send the email claim." }),
        }),
      ]);
    });

    it("passes the token through on later requests", async () => {
      const { db, upsert } = fakeDb();
      const { jwt } = buildAuthConfig(() => db, { log: recorder().log }).callbacks!;
      const existing = { userId: "user-1" } as JWT;
      expect(await jwt!({ token: existing, account: null, user: {} as never })).toBe(existing);
      expect(upsert).not.toHaveBeenCalled();
    });
  });

  describe("session", () => {
    const { session: sessionCallback } = buildAuthConfig(() => fakeDb().db).callbacks!;

    it("exposes the user id and roles", async () => {
      const result = await sessionCallback!({
        session: { user: { name: "Alice" } } as Session,
        token: { userId: "user-1", roles: ["shoutout-user"] } as JWT,
      } as never);
      expect(result.user).toMatchObject({ id: "user-1", roles: ["shoutout-user"] });
    });

    it("treats sessions without roles as ordinary users", async () => {
      const result = await sessionCallback!({
        session: { user: {} } as Session,
        token: { userId: "user-1" } as JWT,
      } as never);
      expect((result as Session).user.roles).toEqual(["shoutout-user"]);
    });
  });
});

describe("authLogger", () => {
  it("sends Auth.js errors (with causes), warnings and debug output to the logger", () => {
    const { log, lines } = recorder();
    const logger = authLogger(log);
    const failure = new Error("CallbackRouteError", {
      cause: { err: Object.assign(new Error("fetch failed"), { code: "ECONNREFUSED" }) },
    });
    logger.error!(failure);
    logger.warn!("debug-enabled");
    logger.debug!("callback", { access_token: "secret-token", ok: true });
    expect(lines[0]).toMatchObject({
      level: "error",
      error: {
        message: "CallbackRouteError",
        cause: { message: "fetch failed", code: "ECONNREFUSED" },
      },
    });
    expect(lines[1]).toMatchObject({
      level: "warn",
      warning: "debug-enabled",
      docs: expect.stringContaining("#debug-enabled"),
    });
    expect(lines[2]).toMatchObject({
      level: "debug",
      msg: "Auth.js: callback",
      metadata: { access_token: "[redacted]", ok: true },
    });
  });
});
