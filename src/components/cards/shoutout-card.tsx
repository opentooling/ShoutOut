import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { formatList } from "@/lib/format";
import { TONE_CLASSES, type CardDesign } from "./designs";
import { CardIllustration } from "./illustrations";

/** A person shown on a card, optionally linking to their profile. */
export type PersonRef = string | { name: string; href: string };

export interface ShoutoutCardProps {
  design: CardDesign;
  message: string;
  from: PersonRef;
  to: PersonRef[];
  /** Company values, shown as tags. */
  values?: string[];
  className?: string;
  /** Shown next to the recipients, e.g. time and privacy. */
  meta?: ReactNode;
  /** Shown under the card body, e.g. reactions and edit/delete buttons. */
  actions?: ReactNode;
  /** "horizontal" puts the artwork beside the message on wider screens (used in the feed). */
  layout?: "stacked" | "horizontal";
}

function nameOf(person: PersonRef): string {
  return typeof person === "string" ? person : person.name;
}

const joinNames = formatList;

function PersonName({ person }: { person: PersonRef }) {
  if (typeof person === "string") {
    return <span className="font-bold text-foreground">{person}</span>;
  }
  return (
    <Link href={person.href} className="font-bold text-foreground hover:underline">
      {person.name}
    </Link>
  );
}

function PeopleList({ people }: { people: PersonRef[] }) {
  return people.map((person, index) => (
    <Fragment key={`${nameOf(person)}-${index}`}>
      {index > 0 && (index === people.length - 1 ? " and " : ", ")}
      <PersonName person={person} />
    </Fragment>
  ));
}

export function ShoutoutCard({
  design,
  message,
  from,
  to,
  values = [],
  className,
  meta,
  actions,
  layout = "stacked",
}: ShoutoutCardProps) {
  const horizontal = layout === "horizontal";
  const tone = TONE_CLASSES[design.tone];
  return (
    <article
      aria-label={`${design.title} from ${nameOf(from)} to ${joinNames(to.map(nameOf))}`}
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border-2 border-border bg-surface shadow-card",
        horizontal && "sm:flex",
        className,
      )}
    >
      <div
        className={cn(
          "relative px-6 pt-5 pb-2",
          horizontal && "sm:flex sm:w-52 sm:shrink-0 sm:flex-col sm:justify-center sm:pb-5",
          tone.soft,
        )}
      >
        <p className={cn("font-display text-2xl font-semibold", tone.strong)}>{design.title}</p>
        <CardIllustration
          name={design.illustration}
          className={cn("mx-auto h-32 w-auto", horizontal && "sm:h-28")}
        />
      </div>
      <div className={cn("space-y-4 p-6", horizontal && "sm:min-w-0 sm:flex-1")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">
            To <PeopleList people={to} />
          </p>
          {meta}
        </div>
        <p className="text-lg leading-relaxed break-words whitespace-pre-line">{message}</p>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Avatar name={nameOf(from)} size="sm" />
            <span className="text-sm">
              <span className="text-muted">From </span>
              <PersonName person={from} />
            </span>
          </div>
          {values.length > 0 && (
            <span className="flex flex-wrap justify-end gap-1">
              {values.map((value) => (
                <span
                  key={value}
                  className="rounded-full bg-surface-muted px-3 py-1 text-xs font-bold text-muted"
                >
                  #{value}
                </span>
              ))}
            </span>
          )}
        </div>
        {actions}
      </div>
    </article>
  );
}

export { joinNames };
