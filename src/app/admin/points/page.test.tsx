import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/admin/guard", () => ({
  requireAdmin: async () => ({ id: "admin-1", name: "Alice", roles: ["shoutout-admin"] }),
}));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@/components/layout/app-header", () => ({ AppHeader: () => <header /> }));
const listPointsBalances = vi.fn();
vi.mock("@/server/admin/points", () => ({ listPointsBalances }));

const { default: PointsPage, metadata } = await import("./page");

describe("PointsPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("lists balances with a CSV download", async () => {
    vi.stubEnv("SHOUTOUT_POINTS_ENABLED", "true");
    vi.stubEnv("SHOUTOUT_POINTS_QUARTERLY_BUDGET", "80");
    listPointsBalances.mockResolvedValue([
      {
        id: "u2",
        name: "Bob Baker",
        email: "bob@x",
        active: true,
        balance: 35,
        receivedThisQuarter: 10,
        givenThisQuarter: 5,
      },
      {
        id: "u3",
        name: "Carol Chen",
        email: "carol@x",
        active: false,
        balance: 10,
        receivedThisQuarter: 0,
        givenThisQuarter: 0,
      },
    ]);
    render(await PointsPage());
    expect(metadata.title).toBe("Points");
    expect(screen.getByText(/Everyone can give 80 points a quarter/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download points.csv" })).toHaveAttribute(
      "href",
      "/admin/export/points",
    );
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Bob Bakerbob@x35105");
    expect(rows[2]).toHaveTextContent("carol@x · no longer active");
    expect(screen.getByRole("link", { name: "Bob Baker" })).toHaveAttribute("href", "/people/u2");
  });

  it("says when points mode is off and when there is nothing yet", async () => {
    listPointsBalances.mockResolvedValue([]);
    render(await PointsPage());
    expect(screen.getByText(/Points mode is off/)).toBeInTheDocument();
    expect(screen.getByText("Nobody has given or received points yet.")).toBeInTheDocument();
  });
});
