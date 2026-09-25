import { describe, expect, it } from "vitest";
import { formatDayCount, formatDayMonth, formatMonthYear, formatRelativeTime } from "./format";

describe("formatRelativeTime", () => {
  const now = new Date("2026-09-17T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it.each([
    [0, "just now"],
    [59_000, "just now"],
    [5 * 60_000, "5m ago"],
    [3 * 3_600_000, "3h ago"],
    [2 * 86_400_000, "2d ago"],
    [10 * 86_400_000, "7 Sep"],
  ])("%sms ago -> %s", (ms, expected) => {
    expect(formatRelativeTime(ago(ms), now)).toBe(expected);
  });

  it("includes the year for older dates and treats future dates as now", () => {
    expect(formatRelativeTime(new Date("2025-03-01T00:00:00Z"), now)).toBe("1 Mar 2025");
    expect(formatRelativeTime(new Date("2026-09-18T00:00:00Z"), now)).toBe("just now");
    expect(formatRelativeTime(new Date())).toBe("just now");
  });
});

describe("formatDayMonth", () => {
  it("formats in UTC", () => {
    expect(formatDayMonth(new Date("2026-10-01T00:00:00Z"))).toBe("1 Oct");
  });
});

describe("formatMonthYear", () => {
  it("formats in UTC with a two-digit year", () => {
    expect(formatMonthYear(new Date("2026-09-01T00:00:00Z"))).toBe("Sep 26");
  });
});

describe("formatDayCount", () => {
  it("uses weeks for whole weeks", () => {
    expect(formatDayCount(1)).toBe("a day");
    expect(formatDayCount(5)).toBe("5 days");
    expect(formatDayCount(0)).toBe("0 days");
    expect(formatDayCount(7)).toBe("a week");
    expect(formatDayCount(14)).toBe("two weeks");
    expect(formatDayCount(21)).toBe("3 weeks");
  });
});
