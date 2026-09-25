import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const getProfile = vi.fn();
const listProfileShoutouts = vi.fn();
const FeedList = vi.fn(
  (props: { nextHref: string | null; emptyText: string; viewerName: string }) => (
    <p>{props.emptyText}</p>
  ),
);

vi.mock("@/auth", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/theme-server", () => ({ getThemePreference: async () => "light" }));
vi.mock("@/server/users/profile", () => ({ getProfile, listProfileShoutouts }));
vi.mock("@/components/layout/app-header", () => ({ AppHeader: () => <header /> }));
vi.mock("@/components/shoutouts/feed-list", () => ({ FeedList }));
const getEmailPreferences = vi.fn();
vi.mock("@/server/notifications/preferences", () => ({ getEmailPreferences }));
vi.mock("@/app/actions/notifications", () => ({ updateEmailPreferencesAction: vi.fn() }));

const { default: ProfilePage, metadata } = await import("./page");

const props = (id: string, query: Record<string, string> = {}) =>
  ({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(query),
  }) as PageProps<"/people/[id]">;

const bobProfile = {
  person: { id: "u2", name: "Bob Baker", email: "bob@x", active: true },
  isSelf: false,
  received: 3,
  sent: 1,
  topValues: [{ name: "Integrity", count: 2 }],
};

describe("ProfilePage", () => {
  beforeEach(() => {
    auth.mockResolvedValue({ user: { id: "u1", name: "Alice", roles: [] } });
    getProfile.mockResolvedValue(bobProfile);
    listProfileShoutouts.mockResolvedValue({ items: [], nextCursor: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("redirects anonymous visitors and 404s unknown people", async () => {
    auth.mockResolvedValue(null);
    await expect(ProfilePage(props("u2"))).rejects.toThrow("NEXT_REDIRECT");
    auth.mockResolvedValue({ user: { id: "u1", roles: [] } });
    getProfile.mockResolvedValue(null);
    await expect(ProfilePage(props("zz"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows someone else's public profile", async () => {
    render(await ProfilePage(props("u2")));
    expect(metadata.title).toBe("Profile");
    expect(screen.getByRole("heading", { name: "Bob Baker" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Recognise Bob" })).toHaveAttribute(
      "href",
      "/shoutouts/new",
    );
    expect(screen.getByText("Shoutouts received").nextSibling).toHaveTextContent("3");
    expect(screen.getByText("#Integrity")).toBeInTheDocument();
    expect(screen.getByText("Only public shoutouts are shown.")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Received" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Sent" })).toHaveAttribute(
      "href",
      "/people/u2?tab=sent",
    );
    expect(listProfileShoutouts).toHaveBeenCalledWith(
      {},
      "u1",
      "u2",
      "received",
      expect.objectContaining({ cursor: undefined }),
    );
    expect(screen.getByText("Bob hasn't received any shoutouts yet.")).toBeInTheDocument();
    expect(FeedList.mock.calls[0][0].viewerName).toBe("Alice");
  });

  it("shows the sent tab with paging", async () => {
    listProfileShoutouts.mockResolvedValue({ items: [], nextCursor: "c9" });
    render(await ProfilePage(props("u2", { tab: "sent", cursor: "c1" })));
    expect(listProfileShoutouts).toHaveBeenCalledWith(
      {},
      "u1",
      "u2",
      "sent",
      expect.objectContaining({ cursor: "c1" }),
    );
    expect(screen.getByRole("link", { name: "Sent" })).toHaveAttribute("aria-current", "page");
    expect(FeedList.mock.calls[0][0].nextHref).toBe("/people/u2?tab=sent&cursor=c9");
    expect(screen.getByText("Bob hasn't sent any shoutouts yet.")).toBeInTheDocument();
  });

  it("shows your own profile with the theme switch", async () => {
    auth.mockResolvedValue({ user: { id: "u2", email: "bob@x", roles: [] } });
    getProfile.mockResolvedValue({ ...bobProfile, isSelf: true, topValues: [] });
    listProfileShoutouts.mockResolvedValue({ items: [], nextCursor: "c2" });
    render(await ProfilePage(props("u2")));
    expect(screen.getByRole("heading", { name: /Bob Baker\s*\(you\)/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Recognise/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    // Email is off in this environment, so there are no email settings.
    expect(screen.queryByRole("heading", { name: "Email me" })).not.toBeInTheDocument();
    expect(screen.queryByText("Recognised most for")).not.toBeInTheDocument();
    expect(FeedList.mock.calls[0][0]).toMatchObject({
      viewerName: "bob@x",
      nextHref: "/people/u2?cursor=c2",
      emptyText: "You haven't received any shoutouts yet.",
    });
    render(await ProfilePage(props("u2", { tab: "sent" })));
    expect(FeedList.mock.calls[1][0].emptyText).toBe("You haven't sent any shoutouts yet.");
  });

  it("shows your email settings when email is set up", async () => {
    vi.stubEnv("SMTP_HOST", "relay.example.com");
    vi.stubEnv("SMTP_FROM", "shoutout@example.com");
    auth.mockResolvedValue({ user: { id: "u2", email: "bob@x", roles: [] } });
    getProfile.mockResolvedValue({ ...bobProfile, isSelf: true });
    getEmailPreferences.mockResolvedValue({ onShoutout: true, budgetReminder: false });
    const { container } = render(await ProfilePage(props("u2")));
    expect(screen.getByRole("heading", { name: "Email me" })).toBeInTheDocument();
    expect(container.querySelector("#email-settings")).not.toBeNull();
    expect(screen.getByRole("checkbox", { name: /someone sends me a shoutout/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /before my shoutouts expire/ })).not.toBeChecked();
    expect(getEmailPreferences).toHaveBeenCalledWith({}, "u2");
  });

  it("never shows email settings on someone else's profile", async () => {
    vi.stubEnv("SMTP_HOST", "relay.example.com");
    vi.stubEnv("SMTP_FROM", "shoutout@example.com");
    render(await ProfilePage(props("u2")));
    expect(screen.queryByRole("heading", { name: "Email me" })).not.toBeInTheDocument();
    expect(getEmailPreferences).not.toHaveBeenCalled();
  });

  it("marks inactive people and can't recognise them", async () => {
    auth.mockResolvedValue({ user: { id: "u1", roles: [] } });
    getProfile.mockResolvedValue({
      ...bobProfile,
      person: { ...bobProfile.person, active: false },
    });
    render(await ProfilePage(props("u2")));
    expect(screen.getByText("No longer active")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Recognise/ })).not.toBeInTheDocument();
    expect(FeedList.mock.calls[0][0].viewerName).toBe("You");
  });
});
