import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FeedItem } from "@/server/shoutouts/feed";

vi.mock("@/app/actions/shoutouts", () => ({ deleteShoutoutAction: vi.fn() }));
vi.mock("@/app/actions/social", () => ({ toggleReactionAction: vi.fn() }));

const { FeedItemCard } = await import("./feed-item");

const now = new Date("2026-09-17T12:00:00Z");
const item: FeedItem = {
  id: "s1",
  message: "Thanks for the help",
  visibility: "PUBLIC",
  points: null,
  createdAt: new Date("2026-09-17T09:00:00Z"),
  editedAt: null,
  card: {
    id: "c",
    slug: "mentor",
    title: "Mentor",
    tagline: "t",
    illustration: "sprout",
    tone: "teal",
  },
  value: { id: "v", name: "Collaboration" },
  sender: { id: "u1", name: "Alice Anders" },
  recipients: [
    { id: "u2", name: "Bob Baker" },
    { id: "u3", name: "Carol Chen" },
  ],
  reactions: [
    {
      key: "clap",
      emoji: "👏",
      label: "Applause",
      count: 2,
      reacted: true,
      names: ["Bob", "Carol"],
    },
  ],
  commentCount: 0,
  canModify: false,
  canReport: true,
};

describe("FeedItemCard", () => {
  it("shows the points when the viewer may see them", () => {
    const { rerender } = render(
      <FeedItemCard item={{ ...item, points: 10 }} viewerName="Bob Baker" now={now} />,
    );
    expect(screen.getByText("🎁 10 points each")).toHaveAttribute(
      "title",
      "Only the sender, the people thanked and admins see points",
    );
    rerender(
      <FeedItemCard
        item={{ ...item, points: 1, recipients: [item.recipients[0]] }}
        viewerName="Bob Baker"
        now={now}
      />,
    );
    expect(screen.getByText("🎁 1 point")).toBeInTheDocument();
  });

  it("shows a public shoutout with profile links, reactions and a comment link", () => {
    render(<FeedItemCard item={item} viewerName="Bob Baker" now={now} />);
    const card = screen.getByRole("article", {
      name: "Mentor from Alice Anders to Bob Baker and Carol Chen",
    });
    expect(card).toHaveClass("sm:flex");
    expect(card).toHaveTextContent("Thanks for the help");
    expect(screen.getByRole("link", { name: "Alice Anders" })).toHaveAttribute(
      "href",
      "/people/u1",
    );
    expect(screen.getByRole("link", { name: "Carol Chen" })).toHaveAttribute("href", "/people/u3");
    expect(screen.getByRole("link", { name: "3h ago" })).toHaveAttribute("href", "/shoutouts/s1");
    expect(screen.getByRole("button", { name: "Applause, 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("link", { name: /Comment$/ })).toHaveAttribute(
      "href",
      "/shoutouts/s1#comments",
    );
    expect(screen.queryByText("Private")).not.toBeInTheDocument();
    expect(screen.queryByText(/edited/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Report" })).toHaveAttribute(
      "href",
      "/shoutouts/s1/report",
    );
  });

  it("marks private and edited shoutouts and offers edit/delete to the sender", () => {
    render(
      <FeedItemCard
        item={{
          ...item,
          visibility: "PRIVATE",
          editedAt: now,
          canModify: true,
          canReport: false,
          commentCount: 1,
        }}
        viewerName="Alice Anders"
        now={now}
      />,
    );
    expect(screen.getByText("Private")).toBeInTheDocument();
    expect(screen.getByText("· edited")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /1 comment$/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/shoutouts/s1/edit",
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("supports the stacked layout without a comment link, and defaults the time", () => {
    render(
      <FeedItemCard
        item={{ ...item, createdAt: new Date(), commentCount: 3 }}
        viewerName="Bob"
        layout="stacked"
        showCommentLink={false}
      />,
    );
    expect(screen.getByRole("article")).not.toHaveClass("sm:flex");
    expect(screen.getByText("just now")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /comments/ })).not.toBeInTheDocument();
  });

  it("pluralises comment counts", () => {
    render(<FeedItemCard item={{ ...item, commentCount: 4 }} viewerName="Bob" now={now} />);
    expect(screen.getByRole("link", { name: /4 comments$/ })).toBeInTheDocument();
  });
});
