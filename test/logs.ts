import { vi } from "vitest";

export interface LogEntry {
  level: string;
  scope: string;
  msg: string;
  [key: string]: unknown;
}

/**
 * Captures the JSON log lines written by `createLogger` (stdout and stderr) for
 * the rest of the test. Restore with `vi.restoreAllMocks()`.
 */
export function captureLogs() {
  const entries: LogEntry[] = [];
  const capture = (chunk: unknown) => {
    for (const line of String(chunk).split("\n").filter(Boolean)) {
      entries.push(JSON.parse(line) as LogEntry);
    }
    return true;
  };
  vi.spyOn(process.stdout, "write").mockImplementation(capture);
  vi.spyOn(process.stderr, "write").mockImplementation(capture);
  return {
    entries,
    find: (msg: string) => entries.find((entry) => entry.msg === msg),
  };
}
