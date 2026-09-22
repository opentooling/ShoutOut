import { describe, expect, it, vi } from "vitest";
import {
  fetchAllUsers,
  fetchServiceToken,
  KeycloakHttpError,
  keycloakAdminBase,
} from "./keycloak-admin";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("keycloakAdminBase", () => {
  it("maps a realm issuer to the admin API", () => {
    expect(keycloakAdminBase("http://auth.localtest.me/realms/shoutout")).toBe(
      "http://auth.localtest.me/admin/realms/shoutout",
    );
    expect(keycloakAdminBase("https://sso.example.com/auth/realms/acme/")).toBe(
      "https://sso.example.com/auth/admin/realms/acme",
    );
  });

  it("rejects non-realm URLs", () => {
    expect(() => keycloakAdminBase("https://example.com/oauth")).toThrow(/Not a Keycloak realm/);
  });
});

describe("fetchServiceToken", () => {
  const credentials = {
    issuer: "http://kc/realms/shoutout/",
    clientId: "shoutout-web",
    clientSecret: "s3cret",
  };

  it("uses the client credentials grant", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ access_token: "token-1" }));
    await expect(fetchServiceToken(credentials, fetchImpl)).resolves.toBe("token-1");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://kc/realms/shoutout/protocol/openid-connect/token");
    expect(init.method).toBe("POST");
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      grant_type: "client_credentials",
      client_id: "shoutout-web",
      client_secret: "s3cret",
    });
  });

  it("fails on HTTP errors with Keycloak's reason and a hint", async () => {
    const invalid = json(
      { error: "unauthorized_client", error_description: "Invalid client" },
      401,
    );
    const error = await fetchServiceToken(credentials, vi.fn().mockResolvedValue(invalid)).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(KeycloakHttpError);
    expect(error).toMatchObject({ status: 401, what: "Keycloak token request" });
    expect((error as Error).message).toBe(
      'Keycloak token request failed with HTTP 401: {"error":"unauthorized_client","error_description":"Invalid client"} (hint: check the client secret (AUTH_KEYCLOAK_SECRET) matches the Keycloak client\'s credentials)',
    );
    await expect(
      fetchServiceToken(credentials, vi.fn().mockResolvedValue(new Response("", { status: 502 }))),
    ).rejects.toThrow(/^Keycloak token request failed with HTTP 502$/);
    const unreadable = new Response("x", { status: 400 });
    vi.spyOn(unreadable, "text").mockRejectedValue(new Error("stream broke"));
    await expect(
      fetchServiceToken(credentials, vi.fn().mockResolvedValue(unreadable)),
    ).rejects.toThrow(/HTTP 400 \(hint: check the client id/);
  });

  it("names the unreachable host and keeps the real reason as the cause", async () => {
    const tls = Object.assign(new Error("self-signed certificate"), {
      code: "SELF_SIGNED_CERT_IN_CHAIN",
    });
    const error = (await fetchServiceToken(
      credentials,
      vi.fn().mockRejectedValue(new TypeError("fetch failed", { cause: tls })),
    ).catch((e: unknown) => e)) as Error;
    expect(error.message).toBe("Keycloak token request: could not reach http://kc");
    expect((error.cause as Error).cause).toBe(tls);
  });

  it("fails on missing tokens", async () => {
    await expect(
      fetchServiceToken(credentials, vi.fn().mockResolvedValue(json({}))),
    ).rejects.toThrow(/no access_token/);
  });
});

describe("fetchAllUsers", () => {
  const user = (id: number) => ({ id: `u${id}`, username: `user${id}`, enabled: true });

  it("pages through all users", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json([user(1), user(2)]))
      .mockResolvedValueOnce(json([user(3), user(4)]))
      .mockResolvedValueOnce(json([user(5)]));
    const users = await fetchAllUsers(
      { issuer: "http://kc/realms/r", token: "t", pageSize: 2 },
      fetchImpl,
    );
    expect(users.map((u) => u.id)).toEqual(["u1", "u2", "u3", "u4", "u5"]);
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
      "http://kc/admin/realms/r/users?first=0&max=2&briefRepresentation=true",
      "http://kc/admin/realms/r/users?first=2&max=2&briefRepresentation=true",
      "http://kc/admin/realms/r/users?first=4&max=2&briefRepresentation=true",
    ]);
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({ authorization: "Bearer t" });
  });

  it("uses a default page size and surfaces errors", async () => {
    const ok = vi.fn().mockResolvedValue(json([]));
    await expect(fetchAllUsers({ issuer: "http://kc/realms/r", token: "t" }, ok)).resolves.toEqual(
      [],
    );
    expect(ok.mock.calls[0][0]).toContain("max=100");
    const failing = vi.fn().mockResolvedValue(json({}, 403));
    await expect(
      fetchAllUsers({ issuer: "http://kc/realms/r", token: "t" }, failing),
    ).rejects.toThrow("Keycloak user listing failed with HTTP 403");
  });

  it("fetches service token from credentials and refreshes on 401", async () => {
    const credentials = {
      issuer: "http://kc/realms/r",
      clientId: "id",
      clientSecret: "sec",
    };
    const fetchImpl = vi
      .fn()
      // Initial token fetch
      .mockResolvedValueOnce(json({ access_token: "token-1" }))
      // Page 1 succeeds
      .mockResolvedValueOnce(json([user(1), user(2)]))
      // Page 2 returns 401 (token expired)
      .mockResolvedValueOnce(json({ error: "invalid_token" }, 401))
      // Refreshed token fetch
      .mockResolvedValueOnce(json({ access_token: "token-2" }))
      // Page 2 retry succeeds
      .mockResolvedValueOnce(json([user(3)]));

    const users = await fetchAllUsers({ credentials, pageSize: 2 }, fetchImpl);
    expect(users.map((u) => u.id)).toEqual(["u1", "u2", "u3"]);
    expect(fetchImpl).toHaveBeenCalledTimes(5);

    // Call 0: Initial token request
    expect(fetchImpl.mock.calls[0][0]).toBe("http://kc/realms/r/protocol/openid-connect/token");
    // Call 1: Page 1 with token-1
    expect(fetchImpl.mock.calls[1][1].headers).toEqual({ authorization: "Bearer token-1" });
    // Call 2: Page 2 with token-1 (failed with 401)
    expect(fetchImpl.mock.calls[2][1].headers).toEqual({ authorization: "Bearer token-1" });
    // Call 3: Token refresh
    expect(fetchImpl.mock.calls[3][0]).toBe("http://kc/realms/r/protocol/openid-connect/token");
    // Call 4: Page 2 retry with token-2
    expect(fetchImpl.mock.calls[4][1].headers).toEqual({ authorization: "Bearer token-2" });
  });

  it("proactively refreshes token when tokenRefreshIntervalMs expires", async () => {
    vi.useFakeTimers();
    try {
      const credentials = {
        issuer: "http://kc/realms/r",
        clientId: "id",
        clientSecret: "sec",
      };
      const fetchImpl = vi
        .fn()
        // Initial token
        .mockResolvedValueOnce(json({ access_token: "token-a" }))
        // Page 1
        .mockImplementationOnce(async () => {
          vi.advanceTimersByTime(5000);
          return json([user(1), user(2)]);
        })
        // Proactive token refresh
        .mockResolvedValueOnce(json({ access_token: "token-b" }))
        // Page 2
        .mockResolvedValueOnce(json([]));

      const users = await fetchAllUsers(
        { credentials, pageSize: 2, tokenRefreshIntervalMs: 3000 },
        fetchImpl,
      );
      expect(users.map((u) => u.id)).toEqual(["u1", "u2"]);
      expect(fetchImpl.mock.calls[1][1].headers).toEqual({ authorization: "Bearer token-a" });
      expect(fetchImpl.mock.calls[3][1].headers).toEqual({ authorization: "Bearer token-b" });
    } finally {
      vi.useRealTimers();
    }
  });
});
