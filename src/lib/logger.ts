/**
 * Minimal structured logger: one JSON object per line on stdout/stderr, which
 * Kubernetes log tooling can parse. `LOG_LEVEL` (debug|info|warn|error, default
 * info) sets the threshold; `LOG_FORMAT=text` prints readable lines for local use.
 *
 * Errors are expanded with their whole `cause` chain, because the useful detail
 * (e.g. an untrusted TLS certificate behind "fetch failed") usually lives there.
 * Values under secret-looking keys are always redacted.
 */

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  isEnabled(level: LogLevel): boolean;
}

export interface LogSink {
  out(line: string): void;
  err(line: string): void;
}

const consoleSink: LogSink = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

const SECRET_KEY =
  /token|secret|password|passwd|authorization|cookie|code_verifier|^code$|^state$/i;
const MAX_DEPTH = 6;

export function parseLevel(raw: string | undefined): LogLevel {
  const value = raw?.trim().toLowerCase();
  return (LOG_LEVELS as readonly string[]).includes(value ?? "") ? (value as LogLevel) : "info";
}

/** Error -> plain object, following `cause` (including Auth.js's `{ err }` causes). */
export function serializeError(error: unknown, depth = 0): unknown {
  if (!(error instanceof Error)) return sanitize(error, depth);
  const extra = error as Error & { code?: unknown; type?: unknown; status?: unknown };
  const out: LogFields = { name: error.name, message: error.message };
  if (extra.type !== undefined) out.type = extra.type;
  if (extra.code !== undefined) out.code = extra.code;
  if (extra.status !== undefined) out.status = extra.status;
  if (error.stack) out.stack = error.stack.split("\n").slice(0, 8).join("\n");
  const cause: unknown = error.cause;
  if (cause !== undefined && depth < MAX_DEPTH) {
    const inner =
      cause instanceof Error
        ? cause
        : typeof cause === "object" &&
            cause !== null &&
            (cause as { err?: unknown }).err instanceof Error
          ? (cause as { err: Error }).err
          : cause;
    out.cause = serializeError(inner, depth + 1);
  }
  return out;
}

/** Deep copy with secrets redacted and errors expanded. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return serializeError(value, depth);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof URL) return value.toString();
  if (depth >= MAX_DEPTH || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      SECRET_KEY.test(key) && inner != null && inner !== ""
        ? "[redacted]"
        : sanitize(inner, depth + 1),
    ]),
  );
}

function textLine(entry: LogFields): string {
  const { time, level, scope, msg, ...rest } = entry;
  const details = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
  return `${time as string} ${(level as string).toUpperCase()} [${scope as string}] ${msg as string}${details}`;
}

export function createLogger(
  scope: string,
  {
    env = process.env,
    sink = consoleSink,
    now = () => new Date(),
  }: { env?: Record<string, string | undefined>; sink?: LogSink; now?: () => Date } = {},
): Logger {
  const threshold = LOG_LEVELS.indexOf(parseLevel(env.LOG_LEVEL));
  const text = env.LOG_FORMAT?.trim().toLowerCase() === "text";
  const isEnabled = (level: LogLevel) => LOG_LEVELS.indexOf(level) >= threshold;

  const write = (level: LogLevel, msg: string, fields?: LogFields) => {
    if (!isEnabled(level)) return;
    const entry: LogFields = {
      time: now().toISOString(),
      level,
      scope,
      msg,
      ...(sanitize(fields ?? {}) as LogFields),
    };
    const line = text ? textLine(entry) : JSON.stringify(entry);
    if (level === "warn" || level === "error") sink.err(line);
    else sink.out(line);
  };

  return {
    debug: (msg, fields) => write("debug", msg, fields),
    info: (msg, fields) => write("info", msg, fields),
    warn: (msg, fields) => write("warn", msg, fields),
    error: (msg, fields) => write("error", msg, fields),
    isEnabled,
  };
}
