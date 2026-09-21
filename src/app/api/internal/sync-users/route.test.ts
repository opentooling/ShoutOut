import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureLogs } from "../../../../../test/logs";

const runKeycloakSync = vi.fn();
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@/server/users/sync-users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/users/sync-users")>()),
  runKeycloakSync,
}));

const { POST } = await import("./route");

const request = (authorization?: string) =>
  new Request("http://app/api/internal/sync-users", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });

describe("POST /api/internal/sync-users", () => {
  beforeEach(() => {
    vi.stubEnv("SHOUTOUT_SYNC_TOKEN", "sync-token-123");
    vi.stubEnv("AUTH_KEYCLOAK_ISSUER", "http://kc/realms/r");
    vi.stubEnv("AUTH_KEYCLOAK_ID", "id");
    vi.stubEnv("AUTH_KEYCLOAK_SECRET", "secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    runKeycloakSync.mockReset();
  });

  it.each([undefined, "Basic abc", "Bearer wrong", "Bearer sync-token-1234"])(
    "rejects authorization %s",
    async (header) => {
      const res = await POST(request(header));
      expect(res.status).toBe(401);
      expect(runKeycloakSync).not.toHaveBeenCalled();
    },
  );

  it("rejects all requests when no token is configured", async () => {
    vi.stubEnv("SHOUTOUT_SYNC_TOKEN", "");
    expect((await POST(request("Bearer "))).status).toBe(401);
  });

  it("returns 503 when Keycloak isn't configured", async () => {
    vi.stubEnv("AUTH_KEYCLOAK_SECRET", "");
    expect((await POST(request("Bearer sync-token-123"))).status).toBe(503);
  });

  it("runs the sync", async () => {
    const logs = captureLogs();
    runKeycloakSync.mockResolvedValue({ created: 1, updated: 2, deactivated: 0, skipped: 0 });
    const res = await POST(request("Bearer sync-token-123"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ created: 1, updated: 2, deactivated: 0, skipped: 0 });
    expect(logs.find("Scheduled sync complete")).toMatchObject({ created: 1, updated: 2 });
  });

  it("reports sync failures", async () => {
    const logs = captureLogs();
    runKeycloakSync.mockRejectedValue(new Error("boom"));
    const res = await POST(request("Bearer sync-token-123"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "sync failed" });
    expect(logs.find("Scheduled sync failed")).toMatchObject({
      level: "error",
      error: { message: "boom" },
    });
  });
});
