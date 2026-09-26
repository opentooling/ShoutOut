"use client";

import { CardIllustration } from "@/components/cards/illustrations";
import { TONE_CLASSES, type CardDesign } from "@/components/cards/designs";
import { cn } from "@/lib/cn";

export interface CardOption {
  id: string;
  design: CardDesign;
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-2 text-sm font-bold text-coral-strong">
      {message}
    </p>
  );
}

export function CardPicker({
  cards,
  value,
  onChange,
  error,
}: {
  cards: CardOption[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  return (
    <fieldset aria-describedby={error ? "cardId-error" : undefined}>
      <legend className="font-display text-xl font-semibold">Pick a card</legend>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map(({ id, design }) => {
          const tone = TONE_CLASSES[design.tone];
          const checked = value === id;
          return (
            <label
              key={id}
              className={cn(
                "flex cursor-pointer flex-col items-center rounded-2xl border-2 p-2 text-center transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ring",
                tone.soft,
                checked ? "border-foreground" : "border-transparent hover:border-border",
              )}
            >
              <input
                type="radio"
                name="cardId"
                value={id}
                checked={checked}
                onChange={() => onChange(id)}
                className="sr-only"
              />
              <CardIllustration name={design.illustration} className="h-14 w-auto" />
              <span className={cn("mt-1 text-sm font-bold", tone.strong)}>{design.title}</span>
            </label>
          );
        })}
      </div>
      <FieldError id="cardId-error" message={error} />
    </fieldset>
  );
}

export function ValuePicker({
  values,
  value,
  onChange,
  error,
}: {
  values: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  return (
    <fieldset aria-describedby={error ? "valueId-error" : undefined}>
      <legend className="font-display text-xl font-semibold">Which value did they show?</legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {values.map((option) => {
          const checked = value === option.id;
          return (
            <label
              key={option.id}
              className={cn(
                "cursor-pointer rounded-full border-2 px-4 py-2 font-bold transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ring",
                checked
                  ? "border-teal-strong bg-teal-strong text-white dark:text-ink"
                  : "border-border bg-surface hover:bg-surface-muted",
              )}
            >
              <input
                type="radio"
                name="valueId"
                value={option.id}
                checked={checked}
                onChange={() => onChange(option.id)}
                className="sr-only"
              />
              {option.name}
            </label>
          );
        })}
      </div>
      <FieldError id="valueId-error" message={error} />
    </fieldset>
  );
}

export function PointsPicker({
  choices,
  value,
  onChange,
  recipients,
  remaining,
  error,
}: {
  choices: number[];
  value: number;
  onChange: (points: number) => void;
  /** People picked so far; each gets the amount. */
  recipients: number;
  /** Points left to give this quarter. */
  remaining: number;
  error?: string;
}) {
  const people = Math.max(recipients, 1);
  const options = [0, ...choices];
  return (
    <fieldset aria-describedby={cn("points-hint", error && "points-error")}>
      <legend className="font-display text-xl font-semibold">Add points? (optional)</legend>
      <p id="points-hint" className="mt-1 text-sm text-muted">
        Each person you thank gets this amount. Only they, you and admins see it.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = value === option;
          const tooMany = option * people > remaining;
          return (
            <label
              key={option}
              className={cn(
                "rounded-full border-2 px-4 py-2 font-bold transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ring",
                checked
                  ? "border-sunny-strong bg-sunny text-on-sunny"
                  : "border-border bg-surface hover:bg-surface-muted",
                tooMany ? "cursor-not-allowed opacity-50" : "cursor-pointer",
              )}
            >
              <input
                type="radio"
                name="points"
                value={option}
                checked={checked}
                disabled={tooMany && !checked}
                onChange={() => onChange(option)}
                className="sr-only"
              />
              {option === 0 ? "No points" : `🎁 ${option}`}
            </label>
          );
        })}
      </div>
      <FieldError id="points-error" message={error} />
    </fieldset>
  );
}

export function VisibilityPicker({
  value,
  onChange,
}: {
  value: "PUBLIC" | "PRIVATE";
  onChange: (value: "PUBLIC" | "PRIVATE") => void;
}) {
  const options = [
    { value: "PUBLIC", label: "Public", hint: "Everyone can see it in the feed" },
    { value: "PRIVATE", label: "Private", hint: "Only you and the recipients" },
  ] as const;
  return (
    <fieldset>
      <legend className="font-display text-xl font-semibold">Who can see it?</legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "cursor-pointer rounded-2xl border-2 px-4 py-3 transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ring",
                checked ? "border-foreground bg-surface" : "border-border hover:bg-surface-muted",
              )}
            >
              <input
                type="radio"
                name="visibility"
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className="block font-bold">{option.label}</span>
              <span className="block text-sm text-muted">{option.hint}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function MessageField({
  value,
  onChange,
  maxLength,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  error?: string;
}) {
  const remaining = maxLength - value.length;
  return (
    <div>
      <label htmlFor="message" className="font-display text-xl font-semibold">
        Say thanks
      </label>
      <textarea
        id="message"
        name="message"
        rows={4}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="What did they do that made a difference?"
        aria-invalid={error ? true : undefined}
        aria-describedby={cn("message-count", error && "message-error")}
        className="mt-3 w-full resize-y rounded-2xl border-2 border-border bg-surface p-4 text-lg placeholder:text-muted focus:border-teal focus:outline-none"
      />
      <div className="flex justify-between gap-3">
        <FieldError id="message-error" message={error} />
        <p
          id="message-count"
          className={cn(
            "mt-1 ml-auto text-sm",
            remaining < 20 ? "text-coral-strong" : "text-muted",
          )}
        >
          {remaining} characters left
        </p>
      </div>
    </div>
  );
}
