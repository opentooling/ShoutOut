import { sql } from "@/lib/sql";
import { count } from "../../../test/factories";
import { describe, expect, it } from "vitest";
import { useTestDb } from "../../../test/db";
import { upsertUserFromOidc } from "./upsert-from-oidc";

describe("upsertUserFromOidc (postgres)", () => {
  const db = useTestDb();

  it("creates a user on first sign-in", async () => {
    const now = new Date("2026-01-02T03:04:05Z");
    const user = await upsertUserFromOidc(
      db,
      { sub: "kc-1", email: "Alice@Example.com", name: "Alice Admin", picture: "http://img/a.png" },
      now,
    );
    expect(user).toMatchObject({
      keycloakId: "kc-1",
      email: "alice@example.com",
      name: "Alice Admin",
      avatarUrl: "http://img/a.png",
      active: true,
      lastLoginAt: now,
    });
  });

  it("updates the existing user on later sign-ins", async () => {
    await upsertUserFromOidc(db, { sub: "kc-1", email: "alice@example.com", name: "Alice" });
    await db.execute(sql`UPDATE users SET active = false WHERE keycloak_id = 'kc-1'`);

    const user = await upsertUserFromOidc(db, {
      sub: "kc-1",
      email: "alice@example.com",
      name: "Alice Renamed",
    });

    expect(user.name).toBe("Alice Renamed");
    expect(user.avatarUrl).toBeNull();
    expect(user.active).toBe(true);
    expect(await count(db, "users")).toBe(1);
  });

  it("rejects profiles without sub or email", async () => {
    await expect(upsertUserFromOidc(db, { email: "x@example.com" })).rejects.toThrow(
      /did not send the sub claim\./,
    );
    await expect(upsertUserFromOidc(db, { sub: "kc-2" })).rejects.toThrow(
      /did not send the email claim\. .*'email' client scope/,
    );
    await expect(upsertUserFromOidc(db, {})).rejects.toThrow(/the sub and email claims\./);
  });
});

describe("upsertUserFromOidc relinking (postgres)", () => {
  const db = useTestDb();

  it("relinks an existing user by email when their Keycloak id changes", async () => {
    const original = await upsertUserFromOidc(db, {
      sub: "old-id",
      email: "erin@example.com",
      name: "Erin",
    });
    const relinked = await upsertUserFromOidc(db, {
      sub: "new-id",
      email: "ERIN@example.com",
      name: "Erin E",
    });
    expect(relinked.id).toBe(original.id);
    expect(relinked.keycloakId).toBe("new-id");
    expect(await count(db, "users")).toBe(1);
  });
});
