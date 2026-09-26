import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPeople, RecipientPicker, type Person } from "./recipient-picker";

const people: Person[] = [
  { id: "1", name: "Bob Baker", email: "bob@x.io" },
  { id: "2", name: "Carol Chen", email: "carol@x.io" },
  { id: "3", name: "Dave Diaz", email: "dave@x.io" },
];

function Harness({
  max = 3,
  initial = [],
  search = vi.fn(async (q: string) =>
    people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
  ),
  error,
}: {
  max?: number;
  initial?: Person[];
  search?: (q: string, signal: AbortSignal) => Promise<Person[]>;
  error?: string;
}) {
  const [selected, setSelected] = useState<Person[]>(initial);
  return (
    <form data-testid="form">
      <RecipientPicker
        selected={selected}
        onChange={setSelected}
        max={max}
        search={search}
        debounceMs={0}
        error={error}
      />
    </form>
  );
}

const combobox = () => screen.getByRole("combobox", { name: /who are you recognising/i });
const hiddenIds = () =>
  new FormData(screen.getByTestId("form") as HTMLFormElement).getAll("recipientIds");

describe("RecipientPicker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("searches and picks people with the mouse", async () => {
    const search = vi.fn(async () => people);
    render(<Harness search={search} />);
    await userEvent.click(combobox());
    await userEvent.type(combobox(), "b");
    const option = await screen.findByRole("option", { name: /Bob Baker/ });
    expect(search).toHaveBeenLastCalledWith("b", expect.any(AbortSignal));
    await userEvent.hover(screen.getByRole("option", { name: /Carol Chen/ }));
    expect(screen.getByRole("option", { name: /Carol Chen/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.mouseDown(option);
    expect(screen.getByText("Bob Baker")).toBeInTheDocument();
    expect(hiddenIds()).toEqual(["1"]);
    expect(combobox()).toHaveValue("");
    // Already-picked people aren't offered again.
    await waitFor(() =>
      expect(screen.queryByRole("option", { name: /Bob Baker/ })).not.toBeInTheDocument(),
    );
  });

  it("supports the keyboard", async () => {
    render(<Harness />);
    await userEvent.click(combobox());
    await screen.findByRole("option", { name: /Bob Baker/ });
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowUp}");
    expect(combobox()).toHaveAttribute("aria-activedescendant", expect.stringMatching(/-1$/));
    await userEvent.keyboard("{Enter}");
    expect(hiddenIds()).toEqual(["2"]);

    await userEvent.keyboard("{Backspace}");
    expect(hiddenIds()).toEqual([]);

    await userEvent.keyboard("{Escape}");
    expect(combobox()).toHaveAttribute("aria-expanded", "false");
    // Enter with the list closed does nothing.
    await userEvent.keyboard("{Enter}{ArrowUp}");
    expect(hiddenIds()).toEqual([]);
    await userEvent.keyboard("{ArrowDown}");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("removes people with their button and stops at the maximum", async () => {
    render(<Harness max={2} initial={[people[0], people[1]]} error="Too many" />);
    expect(combobox()).toBeDisabled();
    expect(combobox()).toHaveAttribute("placeholder", "That's the maximum of 2");
    expect(combobox()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Too many")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove Bob Baker" }));
    expect(hiddenIds()).toEqual(["2"]);
    expect(combobox()).toBeEnabled();
  });

  it("closes on blur and ignores failed searches", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const search = vi.fn().mockRejectedValue(new Error("offline"));
    render(<Harness search={search} />);
    fireEvent.focus(combobox());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(search).toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.blur(combobox());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(combobox()).toHaveAttribute("aria-expanded", "false");
    vi.useRealTimers();
  });

  it("stays open when focus comes straight back after a blur", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Harness />);
    fireEvent.focus(combobox());
    fireEvent.blur(combobox());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    fireEvent.focus(combobox());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(combobox()).toHaveAttribute("aria-expanded", "true");
    vi.useRealTimers();
  });

  it("does not add past the maximum", async () => {
    render(<Harness max={1} />);
    await userEvent.click(combobox());
    const option = await screen.findByRole("option", { name: /Bob Baker/ });
    fireEvent.mouseDown(option);
    expect(hiddenIds()).toEqual(["1"]);
    // Enter on a stale list after reaching the max adds nothing.
    fireEvent.keyDown(combobox(), { key: "Enter" });
    expect(hiddenIds()).toEqual(["1"]);
  });
});

describe("fetchPeople", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the people API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ people }));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    await expect(fetchPeople("bob b", signal)).resolves.toEqual(people);
    expect(fetchMock).toHaveBeenCalledWith("/api/people?q=bob%20b", { signal });
  });

  it("returns nobody on errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));
    await expect(fetchPeople("x", new AbortController().signal)).resolves.toEqual([]);
  });
});

describe("fetchPeopleIncludingSelf", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the API to include the signed-in user", async () => {
    const { fetchPeopleIncludingSelf } = await import("./recipient-picker");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ people }));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    await expect(fetchPeopleIncludingSelf("me", signal)).resolves.toEqual(people);
    expect(fetchMock).toHaveBeenCalledWith("/api/people?self=1&q=me", { signal });
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    await expect(fetchPeopleIncludingSelf("me", signal)).resolves.toEqual([]);
  });

  it("supports a custom label without a hint", () => {
    render(
      <RecipientPicker
        selected={[]}
        onChange={() => {}}
        max={1}
        label="Person"
        hint=""
        name="person"
      />,
    );
    expect(screen.getByRole("combobox", { name: "Person" })).toBeInTheDocument();
  });
});
