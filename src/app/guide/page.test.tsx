import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GUIDE_SECTIONS } from "@/content/user-guide";

const auth = vi.fn();
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/components/layout/app-header", () => ({
  AppHeader: ({ user }: { user: { name?: string } }) => <header>header for {user.name}</header>,
}));
vi.mock("@/content/guide-screenshots.json", () => ({
  // One screenshot deliberately missing, to show the section still renders.
  default: { "feed.jpg": { width: 1800, height: 1350 } },
}));

const { default: GuidePage, metadata } = await import("./page");

describe("GuidePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders every section with contents, steps, tips and captured screenshots", async () => {
    auth.mockResolvedValue({ user: { id: "u1", name: "Bob Baker", roles: [] } });
    render(await GuidePage());
    expect(metadata.title).toBe("User guide");
    expect(screen.getByText("header for Bob Baker")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "ShoutOut user guide" })).toBeVisible();

    const contents = screen.getByRole("navigation", { name: "Guide contents" });
    expect(within(contents).getAllByRole("link")).toHaveLength(GUIDE_SECTIONS.length);
    expect(within(contents).getByRole("link", { name: "Moderation" })).toHaveAttribute(
      "href",
      "#admin-moderation",
    );

    for (const section of GUIDE_SECTIONS) {
      expect(screen.getByRole("heading", { level: 3, name: section.title })).toBeInTheDocument();
    }
    const sending = screen.getByRole("region", { name: "Sending a shoutout" });
    expect(within(sending).getAllByRole("listitem")[0]).toHaveTextContent(
      "Choose Send a shoutout on the feed.",
    );
    expect(within(sending).getByText("Send a shoutout", { selector: "strong" })).toBeVisible();

    const feed = screen.getByRole("img", { name: GUIDE_SECTIONS[1].screenshot.alt });
    expect(feed).toHaveAttribute("src", "/guide/feed.jpg");
    expect(feed).toHaveAttribute("width", "1800");
    expect(feed.closest("a")).toHaveAttribute("href", "/guide/feed.jpg");
    // Sections whose screenshot hasn't been captured still render, without an image.
    expect(within(sending).queryByRole("img")).not.toBeInTheDocument();
  });

  it("works signed out", async () => {
    auth.mockResolvedValue(null);
    render(await GuidePage());
    expect(screen.queryByText(/header for/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
  });
});
