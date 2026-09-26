import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/app-header", () => ({ AppHeader: () => <header /> }));

const { AdminShell } = await import("./admin-shell");
const user = { id: "a", roles: ["shoutout-admin"] };

describe("AdminShell", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows the sections with the current one marked and a pending count", () => {
    render(
      <AdminShell user={user} section="moderation" pendingCount={2} notice="restored">
        <p>content</p>
      </AdminShell>,
    );
    expect(screen.getByRole("heading", { name: "Admin" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Moderation (2)" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Audit log" })).toHaveAttribute("href", "/admin/audit");
    expect(screen.getByRole("status")).toHaveTextContent("Shoutout restored");
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("shows the Points tab with points mode, or while on it", () => {
    const { rerender } = render(
      <AdminShell user={user} section="cards">
        <p />
      </AdminShell>,
    );
    expect(screen.queryByRole("link", { name: "Points" })).not.toBeInTheDocument();
    rerender(
      <AdminShell user={user} section="points">
        <p />
      </AdminShell>,
    );
    expect(screen.getByRole("link", { name: "Points" })).toHaveAttribute("aria-current", "page");
    vi.stubEnv("SHOUTOUT_POINTS_ENABLED", "true");
    rerender(
      <AdminShell user={user} section="cards">
        <p />
      </AdminShell>,
    );
    expect(screen.getByRole("link", { name: "Points" })).toHaveAttribute("href", "/admin/points");
  });

  it("omits a zero count", () => {
    render(
      <AdminShell user={user} section="cards" pendingCount={0}>
        <p />
      </AdminShell>,
    );
    expect(screen.getByRole("link", { name: "Moderation" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Cards" })).toHaveAttribute("aria-current", "page");
  });
});
