import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const getVisibleShoutout = vi.fn();
const listComments = vi.fn();
const FeedItemCard = vi.fn(
  (_props: { viewerName: string; layout: string; showCommentLink: boolean }) => (
    <article>card</article>
  ),
);

vi.mock("@/auth", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@/app/actions/social", () => ({
  addCommentAction: vi.fn(),
  deleteCommentAction: vi.fn(),
}));
vi.mock("@/server/shoutouts/feed", () => ({ getVisibleShoutout }));
vi.mock("@/server/social/comments", () => ({ listComments }));
vi.mock("@/components/layout/app-header", () => ({ AppHeader: () => <header /> }));
vi.mock("@/components/shoutouts/feed-item", () => ({ FeedItemCard }));
vi.mock("@/components/social/comments", () => ({
  CommentList: ({ comments }: { comments: unknown[] }) => (
    <ul>{comments.length} comments listed</ul>
  ),
  CommentForm: () => <form aria-label="comment form" />,
}));

const { default: ShoutoutPage, metadata } = await import("./page");
const props = { params: Promise.resolve({ id: "s1" }) } as PageProps<"/shoutouts/[id]">;

describe("ShoutoutPage", () => {
  beforeEach(() => {
    auth.mockResolvedValue({ user: { id: "u1", name: "Bob", roles: [] } });
    getVisibleShoutout.mockResolvedValue({ id: "s1" });
    listComments.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects anonymous visitors and 404s hidden shoutouts", async () => {
    auth.mockResolvedValue(null);
    await expect(ShoutoutPage(props)).rejects.toThrow("NEXT_REDIRECT");
    auth.mockResolvedValue({ user: { id: "u1", roles: [] } });
    getVisibleShoutout.mockResolvedValue(null);
    await expect(ShoutoutPage(props)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows the shoutout with its comments", async () => {
    listComments.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
    render(await ShoutoutPage(props));
    expect(metadata.title).toBe("Shoutout");
    expect(getVisibleShoutout).toHaveBeenCalledWith({}, "u1", "s1", expect.any(Date), {
      admin: false,
    });
    expect(FeedItemCard.mock.calls[0][0]).toMatchObject({
      viewerName: "Bob",
      layout: "stacked",
      showCommentLink: false,
    });
    expect(screen.getByRole("heading", { name: "Comments (2)" })).toBeInTheDocument();
    expect(screen.getByText("2 comments listed")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "comment form" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to the feed/i })).toHaveAttribute("href", "/");
  });

  it("omits the count without comments and falls back for the viewer name", async () => {
    auth.mockResolvedValue({ user: { id: "u1", email: "b@x", roles: [] } });
    render(await ShoutoutPage(props));
    expect(screen.getByRole("heading", { name: "Comments" })).toBeInTheDocument();
    expect(FeedItemCard.mock.calls[0][0].viewerName).toBe("b@x");
    auth.mockResolvedValue({ user: { id: "u1", roles: [] } });
    render(await ShoutoutPage(props));
    expect(FeedItemCard.mock.calls[1][0].viewerName).toBe("You");
  });
});
