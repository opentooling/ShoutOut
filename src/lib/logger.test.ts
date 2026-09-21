import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, parseLevel, sanitize, serializeError } from "./logger";

function sink() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, sink: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
}

const now = () => new Date("2026-09-21T10:00:00Z");

describe("parseLevel", () => {
  it("accepts known levels in any case and defaults to info", () => {
    expect(parseLevel(" DEBUG ")).toBe("debug");
    expect(parseLevel("error")).toBe("error");
    expect(parseLevel("verbose")).toBe("info");
    expect(parseLevel(undefined)).toBe("info");
  });
});

describe("serializeError", () => {
  it("follows causes, including Auth.js's { err } wrapper", () => {
    const tls = Object.assign(new Error("unable to verify the first certificate"), {
      code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    });
    const fetchFailed = new TypeError("fetch failed", { cause: tls });
    const authError = Object.assign(new Error("Callback failed", { cause: { err: fetchFailed } }), {
      type: "CallbackRouteError",
      status: 500,
    });
    expect(serializeError(authError)).toMatchObject({
      name: "Error",
      message: "Callback failed",
      type: "CallbackRouteError",
      status: 500,
      stack: expect.stringContaining("Callback failed"),
      cause: {
        name: "TypeError",
        message: "fetch failed",
        cause: {
          message: expect.stringMatching(/certificate/),
          code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
        },
      },
    });
  });

  it("keeps non-error causes and non-errors, and stops at a depth limit", () => {
    expect(serializeError(new Error("x", { cause: "plain" }))).toMatchObject({ cause: "plain" });
    expect(serializeError({ reason: "odd" })).toEqual({ reason: "odd" });
    let deep: Error = new Error("0");
    for (let i = 1; i < 10; i++) deep = new Error(String(i), { cause: deep });
    let hops = 0;
    for (let node = serializeError(deep) as { cause?: unknown }; node.cause; hops++) {
      node = node.cause as { cause?: unknown };
    }
    expect(hops).toBe(6);
    const bare = new Error("no stack");
    bare.stack = undefined;
    expect(serializeError(bare)).toEqual({ name: "Error", message: "no stack" });
  });
});

describe("sanitize", () => {
  it("redacts secret-looking keys at any depth, but leaves empty ones", () => {
    expect(
      sanitize({
        access_token: "abc",
        nested: { client_secret: "s", Authorization: "Bearer x", code: "auth-code", ok: 1 },
        list: [{ password: "p" }],
        idToken: null,
        state: "",
        clientSecretSet: true,
      }),
    ).toEqual({
      access_token: "[redacted]",
      nested: {
        client_secret: "[redacted]",
        Authorization: "[redacted]",
        code: "[redacted]",
        ok: 1,
      },
      list: [{ password: "[redacted]" }],
      idToken: null,
      state: "",
      clientSecretSet: true,
    });
  });

  it("formats dates, URLs and errors, and stops recursing eventually", () => {
    expect(
      sanitize({
        at: new Date("2026-01-01T00:00:00Z"),
        url: new URL("https://kc/x"),
        e: new Error("boom"),
      }),
    ).toMatchObject({
      at: "2026-01-01T00:00:00.000Z",
      url: "https://kc/x",
      e: { message: "boom" },
    });
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    expect(JSON.stringify(sanitize(deep))).toContain('"f":{"g":1}');
  });
});

describe("createLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes JSON lines, errors and warnings to stderr", () => {
    const { out, err, sink: s } = sink();
    const log = createLogger("auth", { env: {}, sink: s, now });
    log.debug("hidden");
    log.info("hello", { user: "alice", token: "t" });
    log.warn("careful");
    log.error("broken", { error: new Error("boom") });
    expect(out.map((l) => JSON.parse(l))).toEqual([
      {
        time: "2026-09-21T10:00:00.000Z",
        level: "info",
        scope: "auth",
        msg: "hello",
        user: "alice",
        token: "[redacted]",
      },
    ]);
    expect(err.map((l) => JSON.parse(l).level)).toEqual(["warn", "error"]);
    expect(JSON.parse(err[1]).error.message).toBe("boom");
  });

  it("honours LOG_LEVEL and LOG_FORMAT=text", () => {
    const { out, err, sink: s } = sink();
    const log = createLogger("sync", {
      env: { LOG_LEVEL: "warn", LOG_FORMAT: "Text" },
      sink: s,
      now,
    });
    expect(log.isEnabled("info")).toBe(false);
    expect(log.isEnabled("error")).toBe(true);
    log.info("quiet");
    log.warn("loud", { n: 1 });
    log.error("bare");
    expect(out).toEqual([]);
    expect(err).toEqual([
      '2026-09-21T10:00:00.000Z WARN [sync] loud {"n":1}',
      "2026-09-21T10:00:00.000Z ERROR [sync] bare",
    ]);
    createLogger("debug", { env: { LOG_LEVEL: "debug" }, sink: s, now }).debug("shown");
    expect(JSON.parse(out[0])).toMatchObject({ level: "debug", msg: "shown" });
  });

  it("defaults to process.env and the console streams", () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.stubEnv("LOG_LEVEL", "info");
    const log = createLogger("default");
    log.info("to stdout");
    log.error("to stderr");
    expect(String(stdout.mock.calls[0][0])).toMatch(/"msg":"to stdout".*\n$/);
    expect(String(stderr.mock.calls[0][0])).toMatch(/"msg":"to stderr"/);
    vi.unstubAllEnvs();
  });
});
