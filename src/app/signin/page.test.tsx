import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
vi.mock("@/auth", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/app/actions/auth", () => ({ signInWithKeycloak: vi.fn() }));

const { default: SignInPage, metadata } = await import("./page");

const props = (params: Record<string, string> = {}) =>
  ({ params: Promise.resolve({}), searchParams: Promise.resolve(params) }) as PageProps<"/signin">;

describe("SignInPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the brand, pitch and sign-in button to anonymous visitors", async () => {
    auth.mockResolvedValue(null);
    render(await SignInPage(props()));
    expect(metadata.title).toBe("Sign in");
    expect(screen.getByRole("img", { name: "ShoutOut" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /recognise the people/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in with your work account/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("figure", { hidden: true })).toHaveLength(3);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains a failed sign-in", async () => {
    auth.mockResolvedValue(null);
    render(await SignInPage(props({ error: "Configuration" })));
    expect(screen.getByRole("alert")).toHaveTextContent(/server setup problem/);
  });

  it("sends signed-in users home", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    await expect(SignInPage(props())).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });
});
