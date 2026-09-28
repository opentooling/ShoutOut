import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuideToc } from "./guide-toc";

const groups = [
  {
    title: "Using ShoutOut",
    items: [
      { id: "signing-in", title: "Signing in" },
      { id: "the-feed", title: "The feed" },
    ],
  },
  { title: "For admins", items: [{ id: "admin-moderation", title: "Moderation" }] },
];

type Callback = (entries: { isIntersecting: boolean; target: Element }[]) => void;

describe("GuideToc", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the sections by group", () => {
    render(<GuideToc groups={groups} />);
    const nav = screen.getByRole("navigation", { name: "Guide contents" });
    expect(nav).toHaveTextContent("On this page");
    expect(screen.getByText("For admins")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "The feed" })).toHaveAttribute("href", "#the-feed");
    expect(screen.getAllByRole("list")).toHaveLength(2);
  });

  it("marks the section being read, and the one chosen", async () => {
    let callback: Callback = () => {};
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: Callback) {
          callback = cb;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const section = document.createElement("section");
    section.id = "the-feed";
    document.body.append(section);

    const { unmount } = render(<GuideToc groups={groups} />);
    expect(observe).toHaveBeenCalledTimes(1); // only sections that exist on the page
    act(() => {
      callback([
        { isIntersecting: false, target: section },
        { isIntersecting: true, target: section },
      ]);
    });
    expect(screen.getByRole("link", { name: "The feed" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Signing in" })).not.toHaveAttribute("aria-current");

    await userEvent.click(screen.getByRole("link", { name: "Moderation" }));
    expect(screen.getByRole("link", { name: "Moderation" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    unmount();
    expect(disconnect).toHaveBeenCalled();
    section.remove();
  });
});
