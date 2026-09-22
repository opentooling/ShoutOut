import { Fragment } from "react";

/** Renders `**bold**` spans in guide text; everything else is plain text. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\*\*(.+?)\*\*/g)
        .map((part, i) =>
          i % 2 === 1 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>,
        )}
    </>
  );
}
