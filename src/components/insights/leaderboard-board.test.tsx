import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LeaderboardBoard } from "./leaderboard-board";

const board = {
  entries: [
    { id: "u1", name: "Bob Baker", count: 5, rank: 1 },
    { id: "u2", name: "Carol Chen", count: 5, rank: 1 },
    { id: "u3", name: "Dave Diaz", count: 2, rank: 3 },
    { id: "u4", name: "Erin Evans", count: 1, rank: 4 },
  ],
  viewer: { id: "u9", name: "Me Myself", count: 0, rank: 12 },
  max: 5,
};

describe("LeaderboardBoard", () => {
  it("ranks people with medals, bars, profile links and your position", () => {
    render(
      <LeaderboardBoard
        title="Most recognised"
        description="Received"
        unit="shoutouts"
        board={board}
        viewerId="u3"
      />,
    );
    expect(screen.getByRole("region", { name: "Most recognised" })).toBeInTheDocument();
    const rows = within(screen.getAllByRole("list")[0]).getAllByRole("listitem");
    expect(rows[0]).toHaveAccessibleName("Rank 1: Bob Baker, 5 shoutouts");
    expect(within(rows[0]).getByRole("img", { name: "Rank 1" })).toHaveTextContent("🥇");
    expect(within(rows[1]).getByRole("img", { name: "Rank 1" })).toBeInTheDocument();
    expect(within(rows[2]).getByRole("img", { name: "Rank 3" })).toHaveTextContent("🥉");
    expect(rows[3]).toHaveTextContent("4");
    expect(rows[2]).toHaveClass("bg-sunny-soft");
    expect(rows[2].querySelector(".bg-chart-mark")).toHaveStyle({ width: "40%" });
    expect(screen.getByRole("link", { name: "Carol Chen" })).toHaveAttribute("href", "/people/u2");
    expect(screen.getByText("Your position")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Rank 12: Me Myself, 0 shoutouts" })).toHaveClass(
      "bg-sunny-soft",
    );
  });

  it("can show ranks only, without numbers or bars", () => {
    render(
      <LeaderboardBoard
        title="Most points received"
        description="In order"
        unit="points received"
        board={board}
        viewerId="u1"
        counts={false}
      />,
    );
    const rows = within(screen.getAllByRole("list")[0]).getAllByRole("listitem");
    expect(rows[0]).toHaveAccessibleName("Rank 1: Bob Baker");
    expect(rows[0]).not.toHaveTextContent("5");
    expect(rows[3]).toHaveTextContent(/^4EEErin Evans$/); // rank, avatar initials, name: no count
    expect(document.querySelector(".bg-chart-mark")).toBeNull();
    expect(screen.getByRole("listitem", { name: "Rank 12: Me Myself" })).toBeInTheDocument();
  });

  it("shows values without links and an empty state", () => {
    const { rerender } = render(
      <LeaderboardBoard
        title="Top values"
        description="d"
        unit="shoutouts"
        people={false}
        board={{
          entries: [{ id: "v", name: "Integrity", count: 3, rank: 2 }],
          viewer: null,
          max: 0,
        }}
      />,
    );
    expect(screen.getByText("#Integrity")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("listitem").querySelector(".bg-chart-mark")).toHaveStyle({
      width: "0%",
    });
    rerender(
      <LeaderboardBoard
        title="t"
        description="d"
        unit="u"
        board={{ entries: [], viewer: null, max: 0 }}
        emptyText="Nobody yet"
        footer={<a href="/leaderboard">See all</a>}
      />,
    );
    expect(screen.getByText("Nobody yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/leaderboard");
    rerender(
      <LeaderboardBoard
        title="t"
        description="d"
        unit="u"
        board={{ entries: [], viewer: null, max: 0 }}
      />,
    );
    expect(screen.getByText("No shoutouts in this period yet.")).toBeInTheDocument();
  });
});
