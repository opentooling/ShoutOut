import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const listActiveValues = vi.fn();

vi.mock("@/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@/server/shoutouts/catalog", () => ({ listActiveValues }));
vi.mock("@/components/layout/app-header", () => ({
  AppHeader: ({ user }: { user: { name?: string } }) => <header>header for {user.name}</header>,
}));

const { default: AboutPage } = await import("./page");

describe("AboutPage", () => {
  beforeEach(() => {
    auth.mockResolvedValue({ user: { id: "u1", name: "Bob Baker", roles: [] } });
    listActiveValues.mockResolvedValue([
      { id: "v1", name: "Integrity" },
      { id: "v2", name: "Collaboration" },
    ]);
    vi.stubEnv("SHOUTOUT_QUARTERLY_BUDGET", "12");
    vi.stubEnv("SHOUTOUT_MAX_RECIPIENTS", "3");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("explains the idea, the live values and the configured limits", async () => {
    render(await AboutPage());
    expect(screen.getByRole("heading", { level: 1, name: /why shoutout/i })).toBeInTheDocument();
    expect(screen.getByText("header for Bob Baker")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read the user guide" })).toHaveAttribute(
      "href",
      "/guide",
    );
    expect(screen.getByRole("heading", { name: /look beyond your own team/i })).toBeInTheDocument();
    expect(screen.getByText("Integrity")).toBeInTheDocument();
    expect(screen.getByText("Collaboration")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Why you only get 12 a quarter" })).toBeVisible();
    expect(screen.getByText(/thank up to 3 people/i)).toBeInTheDocument();
    expect(screen.getByText(/up to 280 characters/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Send a shoutout" })).toHaveAttribute(
      "href",
      "/shoutouts/new",
    );
  });

  it("is readable signed out, with its own header and a sign-in call to action", async () => {
    auth.mockResolvedValue(null);
    render(await AboutPage());
    expect(screen.queryByText(/header for/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ShoutOut home" })).toHaveAttribute("href", "/");
    expect(screen.getAllByRole("link", { name: /sign in/i })[0]).toHaveAttribute("href", "/signin");
    expect(screen.getByRole("link", { name: "Sign in to get started" })).toBeInTheDocument();
  });
});
