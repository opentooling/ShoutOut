"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { FieldError } from "./pickers";

export interface Person {
  id: string;
  name: string;
  email: string;
}

export type SearchPeople = (query: string, signal: AbortSignal) => Promise<Person[]>;

export const fetchPeople: SearchPeople = async (query, signal) => {
  const response = await fetch(`/api/people?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) return [];
  const body = (await response.json()) as { people: Person[] };
  return body.people;
};

/** People search that also includes the signed-in user (for filters). */
export const fetchPeopleIncludingSelf: SearchPeople = async (query, signal) => {
  const response = await fetch(`/api/people?self=1&q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) return [];
  const body = (await response.json()) as { people: Person[] };
  return body.people;
};

export function RecipientPicker({
  selected,
  onChange,
  max,
  error,
  search = fetchPeople,
  debounceMs = 200,
  name = "recipientIds",
  label = "Who are you recognising?",
  hint = `Up to ${max} people. Each one uses a shoutout.`,
  labelClassName = "font-display text-xl font-semibold",
}: {
  selected: Person[];
  onChange: (people: Person[]) => void;
  max: number;
  error?: string;
  search?: SearchPeople;
  debounceMs?: number;
  /** Form field name for the selected ids. */
  name?: string;
  label?: string;
  hint?: string;
  labelClassName?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Person[]>([]);
  const [active, setActive] = useState(0);
  const full = selected.length >= max;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      search(query, controller.signal)
        .then((people) => {
          setResults(people);
          setActive(0);
        })
        .catch(() => {
          // Aborted or failed: keep the previous results.
        });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, search, debounceMs]);

  const options = results.filter((person) => !selected.some((s) => s.id === person.id));

  function add(person: Person) {
    if (full) return;
    onChange([...selected, person]);
    setQuery("");
    inputRef.current?.focus();
  }

  function remove(id: string) {
    onChange(selected.filter((person) => person.id !== id));
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      if (open && options[active]) {
        event.preventDefault();
        add(options[active]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Backspace" && query === "" && selected.length > 0) {
      remove(selected[selected.length - 1].id);
    }
  }

  const showList = open && !full && options.length > 0;

  return (
    <div>
      <label htmlFor={`${listId}-input`} className={labelClassName}>
        {label}
      </label>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      <div
        className={cn(
          "relative mt-3 flex flex-wrap items-center gap-2 rounded-2xl border-2 bg-surface p-2 focus-within:border-teal",
          error ? "border-coral" : "border-border",
        )}
      >
        {selected.map((person) => (
          <span
            key={person.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted py-1 pr-1 pl-1"
          >
            <input type="hidden" name={name} value={person.id} />
            <Avatar name={person.name} size="sm" className="size-6 text-[10px]" />
            <span className="text-sm font-bold">{person.name}</span>
            <button
              type="button"
              onClick={() => remove(person.id)}
              aria-label={`Remove ${person.name}`}
              className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-border hover:text-foreground"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={`${listId}-input`}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "recipientIds-error" : undefined}
          autoComplete="off"
          disabled={full}
          value={query}
          placeholder={
            full ? (max === 1 ? "" : `That's the maximum of ${max}`) : "Search by name or email"
          }
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            // Coming back quickly must not be undone by the close from the last blur.
            clearTimeout(closeTimer.current);
            setOpen(true);
          }}
          onBlur={() => {
            closeTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={onKeyDown}
          className="min-w-40 flex-1 bg-transparent px-2 py-1.5 text-lg placeholder:text-muted focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed"
        />
        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Matching people"
            className="absolute top-full right-0 left-0 z-20 mt-2 max-h-72 overflow-auto rounded-2xl border-2 border-border bg-surface p-1 shadow-card"
          >
            {options.map((person, index) => (
              <li
                key={person.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => {
                  event.preventDefault();
                  add(person);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2",
                  index === active && "bg-surface-muted",
                )}
              >
                <Avatar name={person.name} size="sm" />
                <span>
                  <span className="block font-bold">{person.name}</span>
                  <span className="block text-sm text-muted">{person.email}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <FieldError id="recipientIds-error" message={error} />
    </div>
  );
}
