import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const getVisibleShoutout = vi.fn();
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("REDIRECT");
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/app/actions/shoutouts", () => ({ reportShoutoutAction: vi.fn() }));
vi.mock("@/server/shoutouts/feed", () => ({ getVisibleShoutout }));
vi.mock("@/components/layout/app-header", () => ({ AppHeader: () => <header /> }));

const { default: ReportPage, metadata } = await import("./page");
const props = { params: Promise.resolve({ id: "s1" }) } as PageProps<"/shoutouts/[id]/report">;
const shoutout = {
  id: "s1",
  message: "Thanks",
  card: {
    id: "c",
    slug: "thank-you",
    title: "Thank You",
    tagline: "t",
    illustration: "heart",
    tone: "coral",
  },
  values: [{ id: "v", name: "Integrity" }],
  sender: { id: "u2", name: "Bob" },
  recipients: [{ id: "u3", name: "Carol" }],
  canReport: true,
};

describe("ReportPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("requires sign in and a reportable shoutout", async () => {
    auth.mockResolvedValue(null);
    await expect(ReportPage(props)).rejects.toThrow("REDIRECT");
    auth.mockResolvedValue({ user: { id: "u1", roles: [] } });
    getVisibleShoutout.mockResolvedValue(null);
    await expect(ReportPage(props)).rejects.toThrow("NOT_FOUND");
    getVisibleShoutout.mockResolvedValue({ ...shoutout, canReport: false });
    await expect(ReportPage(props)).rejects.toThrow("NOT_FOUND");
  });

  it("shows the shoutout and the report form", async () => {
    auth.mockResolvedValue({ user: { id: "u1", roles: [] } });
    getVisibleShoutout.mockResolvedValue(shoutout);
    render(await ReportPage(props));
    expect(metadata.title).toBe("Report shoutout");
    expect(
      screen.getByRole("article", { name: "Thank You from Bob to Carol" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Spam or gaming the system")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/shoutouts/s1");
  });
});
