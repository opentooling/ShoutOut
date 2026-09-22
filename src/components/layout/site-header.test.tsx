import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./app-header", () => ({
  AppHeader: ({ user }: { user: { name?: string } }) => <header>app header for {user.name}</header>,
}));

const { SiteHeader } = await import("./site-header");

describe("SiteHeader", () => {
  it("shows the full app header when signed in", () => {
    render(<SiteHeader user={{ id: "u1", name: "Bob", roles: [] }} />);
    expect(screen.getByText("app header for Bob")).toBeInTheDocument();
  });

  it("shows the logo and a sign-in link otherwise", () => {
    render(<SiteHeader user={null} />);
    expect(screen.getByRole("link", { name: "ShoutOut home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
  });
});
