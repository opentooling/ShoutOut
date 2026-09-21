import { describe, expect, it } from "vitest";
import {
  decodeJwtPayload,
  DEFAULT_ADMIN_ROLE,
  isAdmin,
  resolveRoles,
  roleConfigFromEnv,
  ROLES,
} from "./roles";

const config = { clientId: "shoutout-web", adminRole: "admin" };

/** An unsigned JWT with the given payload (only the payload is read). */
function jwt(payload: unknown) {
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

describe("roleConfigFromEnv", () => {
  it("defaults to the app's own client and the admin role", () => {
    expect(roleConfigFromEnv({ AUTH_KEYCLOAK_ID: "shoutout-web" })).toEqual(config);
    expect(roleConfigFromEnv({})).toEqual({ clientId: "", adminRole: DEFAULT_ADMIN_ROLE });
  });

  it("can point at another client and role", () => {
    expect(
      roleConfigFromEnv({
        AUTH_KEYCLOAK_ID: "shoutout-web",
        SHOUTOUT_ROLES_CLIENT_ID: " portal ",
        SHOUTOUT_ADMIN_ROLE: " kudos-admin ",
      }),
    ).toEqual({ clientId: "portal", adminRole: "kudos-admin" });
  });
});

describe("decodeJwtPayload", () => {
  it("reads a JWT payload", () => {
    expect(decodeJwtPayload(jwt({ sub: "kc-1" }))).toEqual({ sub: "kc-1" });
  });

  it("ignores anything that isn't a JWT with an object payload", () => {
    expect(decodeJwtPayload(undefined)).toBeNull();
    expect(decodeJwtPayload("opaque-token")).toBeNull();
    expect(decodeJwtPayload("a.!!!.c")).toBeNull();
    expect(decodeJwtPayload(jwt([1, 2]))).toBeNull();
    expect(decodeJwtPayload(jwt("text"))).toBeNull();
  });
});

describe("resolveRoles", () => {
  it("makes everyone a user, even with no roles at all", () => {
    expect(resolveRoles({}, config)).toEqual({
      roles: [ROLES.user],
      clientRoles: [],
      clientsWithRoles: [],
    });
  });

  it("grants admin from the client role in the access token", () => {
    const accessToken = jwt({
      resource_access: {
        "shoutout-web": { roles: ["admin"] },
        account: { roles: ["view-profile"] },
      },
    });
    expect(resolveRoles({ idToken: { sub: "kc-1" }, accessToken }, config)).toEqual({
      roles: [ROLES.user, ROLES.admin],
      clientRoles: ["admin"],
      clientsWithRoles: ["shoutout-web", "account"],
    });
  });

  it("also reads the ID token and de-duplicates", () => {
    const claims = { resource_access: { "shoutout-web": { roles: ["admin", 7] } } };
    expect(resolveRoles({ idToken: claims, accessToken: jwt(claims) }, config).clientRoles).toEqual(
      ["admin"],
    );
  });

  it("ignores realm roles, other clients' roles and other role names", () => {
    const accessToken = jwt({
      realm_access: { roles: ["admin", "shoutout-admin"] },
      resource_access: { portal: { roles: ["admin"] }, "shoutout-web": { roles: ["viewer"] } },
    });
    const { roles, clientsWithRoles } = resolveRoles({ accessToken }, config);
    expect(roles).toEqual([ROLES.user]);
    expect(clientsWithRoles).toEqual(["portal", "shoutout-web"]);
    expect(resolveRoles({ accessToken }, { ...config, clientId: "portal" }).roles).toContain(
      ROLES.admin,
    );
  });

  it("never grants admin without a configured client", () => {
    const accessToken = jwt({ resource_access: { "": { roles: ["admin"] } } });
    expect(resolveRoles({ accessToken }, { ...config, clientId: "" }).roles).toEqual([ROLES.user]);
  });
});

describe("isAdmin", () => {
  it("is true only when the admin role is present", () => {
    expect(isAdmin([ROLES.admin])).toBe(true);
    expect(isAdmin([ROLES.user])).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});

describe("canViewAnalytics", () => {
  it("allows admins always and everyone when configured", async () => {
    const { canViewAnalytics } = await import("./roles");
    expect(canViewAnalytics(["shoutout-admin"], "admins")).toBe(true);
    expect(canViewAnalytics(["shoutout-user"], "admins")).toBe(false);
    expect(canViewAnalytics(undefined, "everyone")).toBe(true);
  });
});
