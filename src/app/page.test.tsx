import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedFilterOptions } from "@/components/shoutouts/feed-filters";

const auth = vi.fn();
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
const getBudget = vi.fn();
const listFeed = vi.fn();
const findPerson = vi.fn();
const FeedFilters = vi.fn(
  (_props: { options: FeedFilterOptions; active: boolean; person: unknown }) => <div>filters</div>,
);
const FeedList = vi.fn(
  (props: { items: { message: string }[]; nextHref: string | null; emptyText: string }) => (
    <div>
      {props.items.map((i) => (
        <article key={i.message}>{i.message}</article>
      ))}
      <p>{props.emptyText}</p>
      {props.nextHref && <a href={props.nextHref}>next</a>}
    </div>
  ),
);

vi.mock("@/auth", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@/server/users/search", () => ({ findPerson }));
vi.mock("@/server/shoutouts/budget", () => ({ getBudget }));
vi.mock("@/server/shoutouts/feed", () => ({ listFeed }));
const topRecipients = vi.fn();
vi.mock("@/server/insights/leaderboard", () => ({ topRecipients }));
vi.mock("@/server/shoutouts/catalog", () => ({
  listActiveCards: async () => [
    { id: "c1", slug: "s", title: "Thank You", tagline: "t", illustration: "heart", tone: "coral" },
  ],
  listActiveValues: async () => [{ id: "v1", name: "Integrity" }],
}));
vi.mock("@/components/layout/app-header", () => ({
  AppHeader: ({ user }: { user: { name?: string } }) => <header>header for {user.name}</header>,
}));
vi.mock("@/components/shoutouts/feed-filters", () => ({ FeedFilters }));
vi.mock("@/components/shoutouts/feed-list", () => ({ FeedList }));

const { default: HomePage } = await import("./page");

const bob = { id: "u1", name: "Bob Baker", email: "bob@example.com", roles: [] };
const props = (params: Record<string, string | string[]> = {}) =>
  ({ params: Promise.resolve({}), searchParams: Promise.resolve(params) }) as PageProps<"/">;
const budget = (remaining: number) => ({
  allowance: 20,
  used: 20 - remaining,
  remaining,
  resetsAt: new Date("2026-10-01T00:00:00Z"),
});

describe("HomePage", () => {
  beforeEach(() => {
    auth.mockResolvedValue({ user: bob });
    getBudget.mockResolvedValue(budget(17));
    listFeed.mockResolvedValue({ items: [], nextCursor: null });
    topRecipients.mockResolvedValue({
      entries: [{ id: "u2", name: "Carol Chen", count: 3, rank: 1 }],
      viewer: null,
      max: 3,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects anonymous visitors to sign in", async () => {
    auth.mockResolvedValue(null);
    await expect(HomePage(props())).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/signin");
  });

  it("greets the user, shows the budget, filters and an empty feed", async () => {
    render(await HomePage(props()));
    expect(screen.getByRole("heading", { name: /hi bob/i })).toBeInTheDocument();
    expect(screen.getByText("header for Bob Baker")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Send a shoutout" })).toHaveAttribute(
      "href",
      "/shoutouts/new",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "17");
    expect(screen.getByRole("link", { name: "Read the user guide" })).toHaveAttribute(
      "href",
      "/guide",
    );
    expect(screen.getByRole("heading", { name: "Latest shoutouts" })).toBeInTheDocument();
    expect(screen.getByText(/be the first to say thanks/i)).toBeInTheDocument();
    expect(FeedFilters.mock.calls[0][0]).toMatchObject({
      options: {
        cards: [{ id: "c1", title: "Thank You" }],
        values: [{ id: "v1", name: "Integrity" }],
      },
      active: false,
      person: null,
    });
    expect(findPerson).not.toHaveBeenCalled();
    expect(FeedList.mock.calls[0][0]).toMatchObject({ viewerName: "Bob Baker", nextHref: null });
  });

  it("shows this month's most recognised people in the sidebar", async () => {
    render(await HomePage(props()));
    const [, range, limit, viewerId] = topRecipients.mock.calls[0];
    expect(range.start.getUTCDate()).toBe(1);
    expect([limit, viewerId]).toEqual([5, "u1"]);
    expect(screen.getByRole("heading", { name: "Top this month" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Carol Chen" })).toHaveAttribute("href", "/people/u2");
    expect(screen.getByRole("link", { name: /full leaderboard/i })).toHaveAttribute(
      "href",
      "/leaderboard",
    );
  });

  it("lists shoutouts, keeps filters in the next-page link and shows notices", async () => {
    listFeed.mockResolvedValue({
      items: [{ id: "s1", message: "Great work" }],
      nextCursor: "s1",
    });
    findPerson.mockResolvedValue({ id: "u2", name: "Carol", email: "c@x" });
    render(
      await HomePage(props({ notice: "sent", person: "u2", value: "v1", from: "2026-09-01" })),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Shoutout sent!");
    expect(screen.getByRole("heading", { name: "Matching shoutouts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "next" })).toHaveAttribute(
      "href",
      "/?person=u2&value=v1&from=2026-09-01&cursor=s1",
    );
    expect(listFeed).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      expect.objectContaining({
        filters: expect.objectContaining({
          personId: "u2",
          valueId: "v1",
          from: new Date("2026-09-01T00:00:00Z"),
        }),
      }),
    );
    expect(FeedFilters.mock.calls[0][0]).toMatchObject({ active: true, person: { name: "Carol" } });
    expect(screen.getByText("No shoutouts match those filters.")).toBeInTheDocument();
  });

  it("pages with a cursor and handles the end of the feed", async () => {
    render(await HomePage(props({ cursor: "s2", notice: ["a", "b"] })));
    expect(listFeed).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      expect.objectContaining({ cursor: "s2" }),
    );
    expect(screen.getByText("No more shoutouts.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("explains when the budget is used up and handles missing names", async () => {
    auth.mockResolvedValue({ user: { ...bob, name: undefined } });
    getBudget.mockResolvedValue(budget(0));
    render(await HomePage(props()));
    expect(screen.getByRole("heading", { name: /hi there/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Send a shoutout" })).not.toBeInTheDocument();
    expect(screen.getByText(/used all your shoutouts/i)).toBeInTheDocument();
    expect(FeedList.mock.calls[0][0]).toMatchObject({ viewerName: "bob@example.com" });

    auth.mockResolvedValue({ user: { id: "u1", roles: [] } });
    render(await HomePage(props()));
    expect(FeedList.mock.calls[1][0]).toMatchObject({ viewerName: "You" });
  });
});
