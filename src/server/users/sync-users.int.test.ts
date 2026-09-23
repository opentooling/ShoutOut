import { sql } from "@/lib/sql";
import { describe, expect, it, vi } from "vitest";
import { useTestDb } from "../../../test/db";
import { captureLogs } from "../../../test/logs";
import { createUser, count, findUser, insertUser } from "../../../test/factories";
import type { KeycloakUser } from "./keycloak-admin";
import {
  isSyncable,
  runKeycloakSync,
  syncCredentialsFromEnv,
  syncUsernamePatternFromEnv,
  syncUsers,
} from "./sync-users";

const kc = (overrides: Partial<KeycloakUser> & { id: string }): KeycloakUser => ({
  username: overrides.id,
  email: `${overrides.id}@example.com`,
  firstName: "First",
  lastName: overrides.id,
  enabled: true,
  ...overrides,
});

describe("isSyncable", () => {
  it("skips service accounts and users without email", () => {
    expect(isSyncable(kc({ id: "a" }))).toBe(true);
    expect(isSyncable(kc({ id: "b", email: undefined }))).toBe(false);
    expect(isSyncable(kc({ id: "c", username: "service-account-shoutout-web" }))).toBe(false);
  });

  it("filters usernames by regex pattern", () => {
    const pattern = /^(?!cbk\.)[a-z]+\.[a-z]+$/;
    expect(isSyncable(kc({ id: "1", username: "john.doe" }), pattern)).toBe(true);
    expect(isSyncable(kc({ id: "2", username: "cbk.bot" }), pattern)).toBe(false);
    expect(isSyncable(kc({ id: "3", username: "admin" }), pattern)).toBe(false);
    expect(
      isSyncable(kc({ id: "4", username: "alice.smith" }), "^(?!cbk\\.)[a-z]+\\.[a-z]+$"),
    ).toBe(true);
  });
});

describe("syncUsernamePatternFromEnv", () => {
  it("returns undefined when unset and RegExp when set", () => {
    expect(syncUsernamePatternFromEnv({})).toBeUndefined();
    const pattern = syncUsernamePatternFromEnv({
      SHOUTOUT_SYNC_USERNAME_PATTERN: "^(?!cbk\\.)[a-z]+\\.[a-z]+$",
    });
    expect(pattern).toBeInstanceOf(RegExp);
    expect(pattern?.test("john.doe")).toBe(true);
    expect(pattern?.test("cbk.service")).toBe(false);
  });
});

describe("syncCredentialsFromEnv", () => {
  it("needs issuer, client id and secret", () => {
    const env = {
      AUTH_KEYCLOAK_ISSUER: "http://kc/realms/r",
      AUTH_KEYCLOAK_ID: "id",
      AUTH_KEYCLOAK_SECRET: "s",
    };
    expect(syncCredentialsFromEnv(env)).toEqual({
      issuer: "http://kc/realms/r",
      clientId: "id",
      clientSecret: "s",
    });
    expect(syncCredentialsFromEnv({ ...env, AUTH_KEYCLOAK_SECRET: "" })).toBeNull();
    expect(syncCredentialsFromEnv({ ...env, AUTH_KEYCLOAK_ID: undefined })).toBeNull();
    expect(syncCredentialsFromEnv({ ...env, AUTH_KEYCLOAK_ISSUER: undefined })).toBeNull();
    expect(syncCredentialsFromEnv()).toBeDefined();
  });
});

describe("syncUsers (postgres)", () => {
  const db = useTestDb();

  it("creates, updates, relinks by email and deactivates users", async () => {
    const existing = await insertUser(db, {
      keycloakId: "kc-bob",
      email: "bob@example.com",
      name: "Old Bob",
    });
    const relinked = await insertUser(db, {
      keycloakId: "old-carol-id",
      email: "carol@example.com",
      name: "Carol",
    });
    const leaver = await createUser(db, { name: "Leaver" });

    const result = await syncUsers(db, [
      kc({ id: "kc-alice", email: "Alice@Example.com", firstName: "Alice", lastName: "Anders" }),
      kc({
        id: "kc-bob",
        email: "bob@example.com",
        firstName: "Bob",
        lastName: "Baker",
        enabled: false,
      }),
      kc({ id: "new-carol-id", email: "carol@example.com", firstName: "Carol", lastName: "Chen" }),
      kc({ id: "svc", username: "service-account-shoutout-web" }),
      kc({ id: "no-email", email: undefined }),
      kc({
        id: "kc-dave",
        username: "dave",
        email: "dave@example.com",
        firstName: undefined,
        lastName: undefined,
      }),
    ]);

    expect(result).toEqual({ created: 2, updated: 2, deactivated: 1, skipped: 2 });
    expect(await findUser(db, { keycloakId: "kc-alice" })).toMatchObject({
      email: "alice@example.com",
      name: "Alice Anders",
      active: true,
    });
    expect(await findUser(db, { id: existing.id })).toMatchObject({
      name: "Bob Baker",
      active: false,
    });
    expect(await findUser(db, { id: relinked.id })).toMatchObject({
      keycloakId: "new-carol-id",
      name: "Carol Chen",
    });
    expect((await findUser(db, { keycloakId: "kc-dave" }))?.name).toBe("dave");
    expect((await findUser(db, { id: leaver.id }))?.active).toBe(false);
  });

  it("skips users that clash and never deactivates everyone on an empty list", async () => {
    await insertUser(db, { keycloakId: "kc-1", email: "one@example.com", name: "One" });
    await insertUser(db, { keycloakId: "kc-2", email: "two@example.com", name: "Two" });
    const logs = captureLogs();

    // kc-1 now claims kc-2's email: the update clashes on the unique email.
    const result = await syncUsers(db, [kc({ id: "kc-1", email: "two@example.com" })]);
    expect(result.skipped).toBe(1);
    expect(logs.entries).toEqual([
      expect.objectContaining({
        level: "warn",
        msg: "Skipped a Keycloak user",
        keycloakId: "kc-1",
      }),
    ]);

    expect(await syncUsers(db, [])).toEqual({ created: 0, updated: 0, deactivated: 0, skipped: 0 });
    expect(await count(db, "users", sql`active`)).toBe(1);
    vi.restoreAllMocks();
  });

  it("runs a full sync through Keycloak's APIs", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: "t" }))
      .mockResolvedValueOnce(Response.json(1))
      .mockResolvedValueOnce(
        Response.json([kc({ id: "kc-zoe", firstName: "Zoe", lastName: "Z" })]),
      );
    const result = await runKeycloakSync(
      db,
      { issuer: "http://kc/realms/r", clientId: "id", clientSecret: "s" },
      fetchImpl,
    );
    expect(result.created).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
