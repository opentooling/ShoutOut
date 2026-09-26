import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SendFormProps } from "@/components/shoutouts/send-form";

const auth = vi.fn();
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
const getBudget = vi.fn();
const SendShoutoutForm = vi.fn((_props: SendFormProps) => <div>send form</div>);

vi.mock("@/auth", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@/app/actions/shoutouts", () => ({ sendShoutoutAction: vi.fn() }));
const getPointsBudget = vi.fn();
vi.mock("@/server/shoutouts/budget", () => ({ getBudget, getPointsBudget }));
vi.mock("@/server/shoutouts/catalog", () => ({
  listActiveCards: async () => [
    {
      id: "c1",
      slug: "thank-you",
      title: "Thank You",
      tagline: "t",
      illustration: "heart",
      tone: "coral",
    },
  ],
  listActiveValues: async () => [{ id: "v1", name: "Integrity" }],
}));
vi.mock("@/components/layout/app-header", () => ({ AppHeader: () => <header /> }));
vi.mock("@/components/shoutouts/send-form", () => ({ SendShoutoutForm }));

const { default: NewShoutoutPage, metadata } = await import("./page");

describe("NewShoutoutPage", () => {
  beforeEach(() => {
    vi.stubEnv("SHOUTOUT_MAX_RECIPIENTS", "4");
    auth.mockResolvedValue({ user: { id: "u1", name: "Alice Anders", email: "a@x", roles: [] } });
    getBudget.mockResolvedValue({ allowance: 20, used: 2, remaining: 18, resetsAt: new Date() });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("passes the points budget and no shoutout limit when configured", async () => {
    vi.stubEnv("SHOUTOUT_BUDGET_ENABLED", "false");
    vi.stubEnv("SHOUTOUT_POINTS_ENABLED", "true");
    vi.stubEnv("SHOUTOUT_POINTS_CHOICES", "10,20");
    getPointsBudget.mockResolvedValue({
      allowance: 100,
      used: 70,
      remaining: 30,
      resetsAt: new Date(),
    });
    render(await NewShoutoutPage());
    expect(getBudget).not.toHaveBeenCalled();
    expect(SendShoutoutForm.mock.calls[0][0]).toMatchObject({
      remaining: null,
      points: { remaining: 30, choices: [10, 20] },
    });
  });

  it("redirects anonymous visitors", async () => {
    auth.mockResolvedValue(null);
    await expect(NewShoutoutPage()).rejects.toThrow("NEXT_REDIRECT");
  });

  it("renders the form with cards, values, budget and limits", async () => {
    render(await NewShoutoutPage());
    expect(metadata.title).toBe("Send a shoutout");
    expect(screen.getByRole("heading", { name: "Send a shoutout" })).toBeInTheDocument();
    expect(screen.getByText("send form")).toBeInTheDocument();
    expect(SendShoutoutForm.mock.calls[0][0]).toMatchObject({
      cards: [{ id: "c1", design: { slug: "thank-you", illustration: "heart" } }],
      values: [{ id: "v1", name: "Integrity" }],
      senderName: "Alice Anders",
      remaining: 18,
      maxRecipients: 4,
      maxMessageLength: 280,
    });
  });

  it("falls back to email or 'You' for the sender name", async () => {
    auth.mockResolvedValue({ user: { id: "u1", email: "a@x", roles: [] } });
    render(await NewShoutoutPage());
    expect(SendShoutoutForm.mock.calls[0][0].senderName).toBe("a@x");
    auth.mockResolvedValue({ user: { id: "u1", roles: [] } });
    render(await NewShoutoutPage());
    expect(SendShoutoutForm.mock.calls[1][0].senderName).toBe("You");
  });

  it("explains when the budget is used up", async () => {
    getBudget.mockResolvedValue({ allowance: 20, used: 20, remaining: 0, resetsAt: new Date() });
    render(await NewShoutoutPage());
    expect(screen.getByText(/used all 20 shoutouts/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the feed" })).toHaveAttribute("href", "/");
    expect(SendShoutoutForm).not.toHaveBeenCalled();
  });
});
