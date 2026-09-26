import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const recordAudit = vi.fn();
const exportShoutoutsCsv = vi.fn(async () => "id\r\n");
const exportPeopleCsv = vi.fn(async () => "name\r\n");
const exportLeaderboardsCsv = vi.fn(async () => "period\r\n");
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ db: true }) }));
vi.mock("@/server/admin/audit", () => ({ recordAudit }));
const exportPointsCsv = vi.fn(async () => "name,points_balance\r\n");
vi.mock("@/server/admin/points", () => ({ exportPointsCsv }));
vi.mock("@/server/admin/export", () => ({
  exportShoutoutsCsv,
  exportPeopleCsv,
  exportLeaderboardsCsv,
}));

const { GET } = await import("./route");
const call = (kind: string, query = "") =>
  GET(new Request(`http://app/admin/export/${kind}${query}`), {
    params: Promise.resolve({ kind }),
  } as RouteContext<"/admin/export/[kind]">);

describe("GET /admin/export/[kind]", () => {
  beforeEach(() => {
    auth.mockResolvedValue({ user: { id: "a", roles: ["shoutout-admin"] } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("is only for admins", async () => {
    auth.mockResolvedValue(null);
    expect((await call("people")).status).toBe(404);
    auth.mockResolvedValue({ user: { id: "u", roles: ["shoutout-user"] } });
    expect((await call("people")).status).toBe(404);
    expect(exportPeopleCsv).not.toHaveBeenCalled();
  });

  it("exports points balances", async () => {
    const response = await call("points");
    expect(await response.text()).toBe("name,points_balance\r\n");
    expect(response.headers.get("content-disposition")).toMatch(/shoutout-points-/);
    expect(exportPointsCsv).toHaveBeenCalledWith({ db: true });
    expect(recordAudit).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({ targetId: "points", details: { kind: "points" } }),
    );
  });

  it("404s for unknown exports", async () => {
    expect((await call("secrets")).status).toBe(404);
  });

  it("exports shoutouts for an inclusive date range and records the download", async () => {
    const res = await call("shoutouts", "?from=2026-09-01&to=2026-09-30");
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="shoutout-shoutouts-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(await res.text()).toBe("id\r\n");
    expect(exportShoutoutsCsv).toHaveBeenCalledWith(
      { db: true },
      { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-10-01T00:00:00Z") },
    );
    expect(recordAudit).toHaveBeenCalledWith(
      { db: true },
      {
        actorId: "a",
        action: "export.downloaded",
        targetType: "export",
        targetId: "shoutouts",
        details: { kind: "shoutouts", from: "2026-09-01", to: "2026-09-30" },
      },
    );
  });

  it("exports people for all time and leaderboards for a period", async () => {
    expect(await (await call("people")).text()).toBe("name\r\n");
    expect(exportPeopleCsv).toHaveBeenCalledWith(
      { db: true },
      { start: undefined, end: undefined },
    );
    expect(recordAudit.mock.calls[0][1].details).toEqual({ kind: "people", from: "", to: "" });
    expect(await (await call("leaderboards", "?period=week")).text()).toBe("period\r\n");
    expect(exportLeaderboardsCsv).toHaveBeenCalledWith({ db: true }, "week", expect.any(Date), {
      points: false,
    });
  });
});
