import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
const topRecipients = vi.fn();
const topSenders = vi.fn();
const topValues = vi.fn();
const LeaderboardBoard = vi.fn(
  (props: {
    title: string;
    viewerId?: string;
    people?: boolean;
    counts?: boolean;
    description?: string;
    board?: { entries: { count: number }[] };
  }) => <section aria-label={props.title} />,
);

vi.mock("@/auth", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
const topPointsRecipients = vi.fn();
vi.mock("@/server/insights/leaderboard", async (importOriginal) => ({
  ranksOnly: (await importOriginal<typeof import("@/server/insights/leaderboard")>()).ranksOnly,
  topRecipients,
  topSenders,
  topValues,
  topPointsRecipients,
}));
vi.mock("@/components/layout/app-header", () => ({ AppHeader: () => <header /> }));
vi.mock("@/components/insights/leaderboard-board", () => ({ LeaderboardBoard }));

const { default: LeaderboardPage, metadata } = await import("./page");
const props = (period?: string) =>
  ({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(period ? { period } : {}),
  }) as PageProps<"/leaderboard">;
const empty = { entries: [], viewer: null, max: 0 };

describe("LeaderboardPage", () => {
  beforeEach(() => {
    auth.mockResolvedValue({ user: { id: "u1", roles: [] } });
    for (const fn of [topRecipients, topSenders, topValues]) fn.mockResolvedValue(empty);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("adds a points board with ranks only, and totals for admins", async () => {
    vi.stubEnv("SHOUTOUT_POINTS_ENABLED", "true");
    topPointsRecipients.mockResolvedValue({
      entries: [{ id: "u2", name: "Carol", count: 40, rank: 1 }],
      viewer: null,
      max: 40,
    });
    render(await LeaderboardPage(props()));
    const pointsBoard = LeaderboardBoard.mock.calls[3][0];
    expect(pointsBoard).toMatchObject({
      title: "Most points received",
      description: "In order of points received",
      counts: false,
    });
    expect(pointsBoard.board!.entries[0].count).toBe(0);
    expect(screen.getByText(/Points totals are private/)).toBeInTheDocument();

    auth.mockResolvedValue({ user: { id: "a1", roles: ["shoutout-admin"] } });
    render(await LeaderboardPage(props()));
    const adminBoard = LeaderboardBoard.mock.calls[7][0];
    expect(adminBoard).toMatchObject({ description: "Points received", counts: true });
    expect(adminBoard.board!.entries[0].count).toBe(40);
    expect(screen.getByText(/Only admins see points totals/)).toBeInTheDocument();
  });

  it("redirects anonymous visitors", async () => {
    auth.mockResolvedValue(null);
    await expect(LeaderboardPage(props())).rejects.toThrow("NEXT_REDIRECT");
  });

  it("defaults to this month and shows the three boards", async () => {
    render(await LeaderboardPage(props()));
    expect(metadata.title).toBe("Leaderboard");
    expect(screen.getByRole("link", { name: "This month" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(LeaderboardBoard.mock.calls.map((c) => c[0].title)).toEqual([
      "Most recognised",
      "Top recognisers",
      "Top values",
    ]);
    expect(LeaderboardBoard.mock.calls[0][0].viewerId).toBe("u1");
    expect(LeaderboardBoard.mock.calls[2][0].people).toBe(false);
    const [, range, limit, viewer] = topRecipients.mock.calls[0];
    expect(range.start).toBeInstanceOf(Date);
    expect([limit, viewer]).toEqual([10, "u1"]);
  });

  it("uses the chosen period", async () => {
    render(await LeaderboardPage(props("all")));
    expect(screen.getByRole("link", { name: "All time" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "This week" })).toHaveAttribute(
      "href",
      "/leaderboard?period=week",
    );
    expect(topValues).toHaveBeenCalledWith({}, {});
  });
});
