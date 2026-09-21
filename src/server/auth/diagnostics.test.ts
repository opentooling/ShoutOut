import { describe, expect, it, vi } from "vitest";
import { createLogger } from "@/lib/logger";
import { authSummary, checkAuthSetup, hintFor, rootCode } from "./diagnostics";

const env = {
  AUTH_URL: "https://shoutout.example.com",
  AUTH_SECRET: "auth-secret",
  AUTH_KEYCLOAK_ISSUER: "https://sso.example.com/realms/acme",
  AUTH_KEYCLOAK_ID: "shoutout-web",
  AUTH_KEYCLOAK_SECRET: "client-secret",
};

function recorder() {
  const lines: Record<string, unknown>[] = [];
  const push = (line: string) => lines.push(JSON.parse(line) as Record<string, unknown>);
  return { lines, log: createLogger("auth", { env: {}, sink: { out: push, err: push } }) };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("rootCode and hintFor", () => {
  it("finds the innermost code in a cause chain", () => {
    const tls = Object.assign(new Error("bad cert"), { code: "SELF_SIGNED_CERT_IN_CHAIN" });
    const wrapped = Object.assign(new TypeError("fetch failed", { cause: tls }), { code: 42 });
    expect(rootCode(wrapped)).toBe("SELF_SIGNED_CERT_IN_CHAIN");
    expect(rootCode(new Error("plain"))).toBeUndefined();
    expect(rootCode(undefined)).toBeUndefined();
  });

  it("explains common failures", () => {
    expect(hintFor("UNABLE_TO_VERIFY_LEAF_SIGNATURE")).toMatch(/NODE_EXTRA_CA_CERTS/);
    expect(hintFor("ENOTFOUND")).toMatch(/doesn't resolve/);
    expect(hintFor("EAI_AGAIN")).toMatch(/doesn't resolve/);
    expect(hintFor("ECONNREFUSED")).toMatch(/isn't reachable/);
    expect(hintFor("SOMETHING_ELSE")).toBeUndefined();
    expect(hintFor(undefined)).toBeUndefined();
  });
});

describe("authSummary", () => {
  it("reports settings without secret values", () => {
    const summary = authSummary({ ...env, SHOUTOUT_ADMIN_ROLE: "kudos-admin" });
    expect(summary).toEqual({
      appUrl: env.AUTH_URL,
      issuer: env.AUTH_KEYCLOAK_ISSUER,
      clientId: "shoutout-web",
      clientSecretSet: true,
      authSecretSet: true,
      rolesClient: "shoutout-web",
      adminRole: "kudos-admin",
      extraCaCerts: undefined,
    });
    expect(JSON.stringify(summary)).not.toContain("client-secret");
  });
});

describe("checkAuthSetup", () => {
  it("confirms a reachable Keycloak with a matching issuer", async () => {
    const { log, lines } = recorder();
    const fetchImpl = vi.fn().mockResolvedValue(json({ issuer: `${env.AUTH_KEYCLOAK_ISSUER}/` }));
    await expect(
      checkAuthSetup({
        env: { ...env, AUTH_KEYCLOAK_ISSUER: `${env.AUTH_KEYCLOAK_ISSUER}/` },
        fetchImpl,
        log,
      }),
    ).resolves.toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://sso.example.com/realms/acme/.well-known/openid-configuration",
    );
    expect(lines.map((l) => l.msg)).toEqual(["Auth configuration", "Keycloak discovery OK"]);
  });

  it("names missing settings", async () => {
    const { log, lines } = recorder();
    const fetchImpl = vi.fn();
    expect(await checkAuthSetup({ env: { AUTH_URL: env.AUTH_URL }, fetchImpl, log })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lines[1]).toMatchObject({
      level: "error",
      missing: ["AUTH_SECRET", "AUTH_KEYCLOAK_ISSUER", "AUTH_KEYCLOAK_ID", "AUTH_KEYCLOAK_SECRET"],
    });
  });

  it("reports HTTP errors from the discovery URL", async () => {
    const { log, lines } = recorder();
    const fetchImpl = vi.fn().mockResolvedValue(json({ error: "Realm does not exist" }, 404));
    expect(await checkAuthSetup({ env, fetchImpl, log })).toBe(false);
    expect(lines[1]).toMatchObject({ msg: "Keycloak discovery request failed", status: 404 });
  });

  it("spots an issuer mismatch, e.g. Keycloak behind a proxy", async () => {
    const { log, lines } = recorder();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(json({ issuer: "http://keycloak:8080/realms/acme" }));
    expect(await checkAuthSetup({ env, fetchImpl, log })).toBe(false);
    expect(lines[1]).toMatchObject({
      configured: env.AUTH_KEYCLOAK_ISSUER,
      reported: "http://keycloak:8080/realms/acme",
    });
    fetchImpl.mockResolvedValue(json({}));
    expect(await checkAuthSetup({ env, fetchImpl, log })).toBe(false);
  });

  it("explains network and certificate failures", async () => {
    const { log, lines } = recorder();
    const tls = Object.assign(new Error("unable to get local issuer certificate"), {
      code: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    });
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed", { cause: tls }));
    expect(await checkAuthSetup({ env, fetchImpl, log })).toBe(false);
    expect(lines[1]).toMatchObject({
      level: "error",
      msg: "Could not reach Keycloak",
      errorCode: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
      hint: expect.stringMatching(/company CA/),
      error: { message: "fetch failed", cause: { code: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" } },
    });
  });

  it("uses process.env, fetch and a default logger", async () => {
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("AUTH_SECRET", "");
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    expect(await checkAuthSetup()).toBe(false);
    expect(String(stderr.mock.calls[0][0])).toMatch(/required settings are missing/);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
});
