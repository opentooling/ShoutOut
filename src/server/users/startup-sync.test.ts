import { afterEach, describe, expect, it, vi } from "vitest";
import { captureLogs } from "../../../test/logs";

vi.mock("@/lib/db", () => ({ getDb: () => ({ fake: "db" }) }));

const { startupSync } = await import("./startup-sync");

const env = {
  AUTH_KEYCLOAK_ISSUER: "http://kc/realms/r",
  AUTH_KEYCLOAK_ID: "id",
  AUTH_KEYCLOAK_SECRET: "secret",
};
const result = { created: 1, updated: 0, deactivated: 0, skipped: 0 };

describe("startupSync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing without Keycloak credentials or when disabled", async () => {
    const logs = captureLogs();
    const run = vi.fn();
    expect(await startupSync({ run, env: {} })).toBe(false);
    expect(await startupSync({ run, env: { ...env, SHOUTOUT_SYNC_ON_STARTUP: "false" } })).toBe(
      false,
    );
    expect(run).not.toHaveBeenCalled();
    expect(logs.entries.map((e) => e.reason)).toEqual([
      "Keycloak client settings are missing",
      "SHOUTOUT_SYNC_ON_STARTUP=false",
    ]);
  });

  it("syncs once when Keycloak is ready", async () => {
    const logs = captureLogs();
    const run = vi.fn().mockResolvedValue(result);
    expect(await startupSync({ run, env })).toBe(true);
    expect(run).toHaveBeenCalledWith(
      { fake: "db" },
      { issuer: env.AUTH_KEYCLOAK_ISSUER, clientId: "id", clientSecret: "secret" },
    );
    expect(logs.find("Startup sync complete")).toMatchObject({ scope: "user-sync", ...result });
  });

  it("retries while Keycloak starts, then gives up", async () => {
    const logs = captureLogs();
    const flaky = vi.fn().mockRejectedValueOnce(new Error("HTTP 404")).mockResolvedValue(result);
    expect(await startupSync({ run: flaky, env, attempts: 3, delayMs: 1 })).toBe(true);
    expect(flaky).toHaveBeenCalledTimes(2);

    const broken = vi.fn().mockRejectedValue(new Error("down"));
    expect(await startupSync({ run: broken, env, attempts: 2, delayMs: 1 })).toBe(false);
    expect(broken).toHaveBeenCalledTimes(2);
    const failures = logs.entries.filter((e) => e.msg === "Startup sync attempt failed");
    expect(failures.at(-1)).toMatchObject({
      level: "warn",
      attempt: 2,
      attempts: 2,
      error: { message: "down" },
    });
    expect(logs.entries.at(-1)).toMatchObject({ level: "error", msg: /gave up/ });
  });

  it("uses process.env by default", async () => {
    captureLogs();
    vi.stubEnv("AUTH_KEYCLOAK_SECRET", "");
    expect(await startupSync()).toBe(false);
    vi.unstubAllEnvs();
  });
});
