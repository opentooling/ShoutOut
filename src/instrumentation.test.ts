import { afterEach, describe, expect, it, vi } from "vitest";
import { captureLogs } from "../test/logs";

const startupSync = vi.fn().mockResolvedValue(true);
const checkAuthSetup = vi.fn().mockResolvedValue(true);
vi.mock("./server/users/startup-sync", () => ({ startupSync }));
vi.mock("./server/auth/diagnostics", () => ({ checkAuthSetup }));

const { register, onRequestError } = await import("./instrumentation");

describe("register", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("checks the auth setup and starts the user sync on the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await register();
    expect(checkAuthSetup).toHaveBeenCalledOnce();
    expect(startupSync).toHaveBeenCalledOnce();
  });

  it("skips other runtimes", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await register();
    expect(checkAuthSetup).not.toHaveBeenCalled();
    expect(startupSync).not.toHaveBeenCalled();
  });
});

describe("onRequestError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const request = { path: "/shoutouts/new", method: "POST", headers: {} };
  const context = {
    routerKind: "App Router",
    routePath: "/shoutouts/new",
    routeType: "action",
    revalidateReason: undefined,
  } as const;

  it("logs unhandled errors with the route and digest", async () => {
    const logs = captureLogs();
    const error = Object.assign(new Error("boom", { cause: new Error("db down") }), {
      digest: "123",
    });
    await onRequestError(error, request, context);
    expect(logs.entries[0]).toMatchObject({
      level: "error",
      scope: "request",
      msg: "Unhandled error",
      method: "POST",
      path: "/shoutouts/new",
      routeType: "action",
      digest: "123",
      error: { message: "boom", cause: { message: "db down" } },
    });
  });

  it("copes with thrown values that aren't errors", async () => {
    const logs = captureLogs();
    await onRequestError("just a string", request, context);
    expect(logs.entries[0]).toMatchObject({ error: "just a string" });
    expect(logs.entries[0].digest).toBeUndefined();
  });
});
