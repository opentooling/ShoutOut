import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModerationCase } from "@/server/admin/moderation";

vi.mock("@/app/admin/guard", () => ({
  requireAdmin: async () => ({ id: "a", roles: ["shoutout-admin"] }),
}));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@/app/actions/admin", () => ({ resolveReportAction: vi.fn() }));
vi.mock("@/components/layout/app-header", () => ({ AppHeader: () => <header /> }));
const listPendingCases = vi.fn();
const listResolvedCases = vi.fn();
vi.mock("@/server/admin/moderation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/admin/moderation")>()),
  listPendingCases,
  listResolvedCases,
}));

const { default: ModerationPage, metadata } = await import("./page");
const props = (notice?: string | string[]) =>
  ({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(notice ? { notice } : {}),
  }) as PageProps<"/admin">;

const makeCase = (id: string, overrides: Partial<ModerationCase> = {}): ModerationCase => ({
  status: "HIDDEN",
  shoutout: {
    id,
    message: `Message ${id}`,
    visibility: "PUBLIC",
    points: null,
    createdAt: new Date(),
    editedAt: null,
    card: {
      id: "c",
      slug: "thank-you",
      title: "Thank You",
      tagline: "t",
      illustration: "heart",
      tone: "coral",
    },
    values: [{ id: "v", name: "Integrity" }],
    sender: { id: "u1", name: "Bob" },
    recipients: [{ id: "u2", name: "Carol" }],
    reactions: [],
    commentCount: 0,
    canModify: false,
    canReport: false,
  },
  reports: [
    {
      id: `r-${id}`,
      reason: "SPAM",
      note: "Duplicate",
      createdAt: new Date(),
      resolvedAt: null,
      resolution: null,
      reporter: { id: "u3", name: "Dave" },
      resolvedBy: null,
    },
  ],
  ...overrides,
});

describe("ModerationPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows an empty queue", async () => {
    listPendingCases.mockResolvedValue([]);
    listResolvedCases.mockResolvedValue([]);
    render(await ModerationPage(props(["a", "b"])));
    expect(metadata.title).toBe("Moderation");
    expect(screen.getByText("Nothing to review. 🎉")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recently reviewed" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Moderation" })).toBeInTheDocument();
  });

  it("lists pending and reviewed cases with actions", async () => {
    listPendingCases.mockResolvedValue([
      makeCase("s1"),
      makeCase("s2", {
        shoutout: { ...makeCase("s2").shoutout, visibility: "PRIVATE" },
        reports: [{ ...makeCase("s2").reports[0], note: null, reason: "WEIRD" as never }],
      }),
    ]);
    listResolvedCases.mockResolvedValue([
      makeCase("s3", {
        status: "REMOVED",
        reports: [
          {
            ...makeCase("s3").reports[0],
            resolvedAt: new Date(),
            resolution: "REMOVED",
            resolvedBy: { id: "a", name: "Alice" },
          },
          {
            ...makeCase("s3").reports[0],
            id: "r2",
            resolution: "RESTORED",
            resolvedAt: new Date(),
            resolvedBy: { id: "a", name: "Alice" },
          },
        ],
      }),
    ]);
    render(await ModerationPage(props("removed")));
    expect(screen.getByRole("status")).toHaveTextContent("Shoutout removed.");
    expect(screen.getByRole("link", { name: "Moderation (2)" })).toBeInTheDocument();
    const pending = within(screen.getByRole("list", { name: "Reported shoutouts" }));
    const [first, second] = pending
      .getAllByRole("listitem")
      .filter((li) => li.querySelector("button"));
    expect(first).toHaveTextContent("Spam or gaming the system");
    expect(first).toHaveTextContent("“Duplicate”");
    expect(within(first).getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(second).toHaveTextContent("Private ·");
    expect(second).toHaveTextContent("WEIRD");
    const reviewed = screen.getByRole("list", { name: "Reviewed shoutouts" });
    expect(reviewed).toHaveTextContent("Removed by Alice");
    expect(reviewed).toHaveTextContent("Restored by Alice");
    expect(within(reviewed).queryByRole("button")).not.toBeInTheDocument();
  });
});
