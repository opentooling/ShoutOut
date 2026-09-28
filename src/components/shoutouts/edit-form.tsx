"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { FormState } from "@/app/actions/shoutouts";
import { buttonClasses } from "@/components/ui/button";
import {
  CardPicker,
  MessageField,
  ValuePicker,
  VisibilityPicker,
  type CardOption,
} from "./pickers";

export interface EditFormProps {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  cards: CardOption[];
  values: { id: string; name: string }[];
  initial: {
    cardId: string;
    valueIds: string[];
    message: string;
    visibility: "PUBLIC" | "PRIVATE";
  };
  maxMessageLength: number;
  /** Most company values per shoutout. */
  maxValues: number;
}

export function EditShoutoutForm({
  action,
  cards,
  values,
  initial,
  maxMessageLength,
  maxValues,
}: EditFormProps) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [cardId, setCardId] = useState(initial.cardId);
  const [valueIds, setValueIds] = useState(initial.valueIds);
  const [message, setMessage] = useState(initial.message);
  const [visibility, setVisibility] = useState(initial.visibility);
  const errors = state.status === "error" ? state.fieldErrors : {};

  return (
    <form action={formAction} className="space-y-8">
      {state.status === "error" && (
        <p role="alert" className="rounded-2xl bg-coral-soft px-4 py-3 font-bold text-coral-strong">
          {state.message}
        </p>
      )}
      <CardPicker cards={cards} value={cardId} onChange={setCardId} error={errors.cardId} />
      <ValuePicker
        values={values}
        value={valueIds}
        onChange={setValueIds}
        // A shoutout sent before the limit was lowered keeps what it has.
        max={Math.max(maxValues, initial.valueIds.length)}
        error={errors.valueIds}
      />
      <MessageField
        value={message}
        onChange={setMessage}
        maxLength={maxMessageLength}
        error={errors.message}
      />
      <VisibilityPicker value={visibility} onChange={setVisibility} />
      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={buttonClasses({ size: "lg" })}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link href="/" className={buttonClasses({ variant: "ghost", size: "lg" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
