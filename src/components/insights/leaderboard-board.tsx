import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import type { Board, RankedEntry } from "@/server/insights/leaderboard";

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function Row({
  entry,
  max,
  unit,
  people,
  highlight,
  counts,
}: {
  entry: RankedEntry;
  max: number;
  unit: string;
  people: boolean;
  highlight: boolean;
  counts: boolean;
}) {
  const name = people ? (
    <Link href={`/people/${entry.id}`} className="truncate font-bold hover:underline">
      {entry.name}
    </Link>
  ) : (
    <span className="truncate font-bold">#{entry.name}</span>
  );
  return (
    <li
      aria-label={`Rank ${entry.rank}: ${entry.name}${counts ? `, ${entry.count} ${unit}` : ""}`}
      className={cn(
        "grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-2 py-2",
        highlight && "bg-sunny-soft",
      )}
    >
      <span className="text-center text-lg font-bold tabular-nums">
        {MEDALS[entry.rank] ? (
          <span role="img" aria-label={`Rank ${entry.rank}`}>
            {MEDALS[entry.rank]}
          </span>
        ) : (
          entry.rank
        )}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          {people && <Avatar name={entry.name} size="sm" />}
          {name}
        </span>
        {counts && (
          <span className="mt-1 block h-1.5 rounded-full bg-surface-muted" aria-hidden>
            <span
              className="block h-full rounded-full bg-chart-mark"
              style={{ width: `${max === 0 ? 0 : (entry.count / max) * 100}%` }}
            />
          </span>
        )}
      </span>
      <span className="text-right">
        {counts && (
          <span className="font-display text-xl font-semibold tabular-nums">{entry.count}</span>
        )}
      </span>
    </li>
  );
}

export function LeaderboardBoard({
  title,
  description,
  board,
  unit,
  people = true,
  viewerId,
  emptyText = "No shoutouts in this period yet.",
  footer,
  counts = true,
}: {
  title: string;
  description: string;
  board: Board;
  unit: string;
  people?: boolean;
  viewerId?: string;
  emptyText?: string;
  /** Extra content at the bottom, e.g. a link to the full leaderboard. */
  footer?: ReactNode;
  /** False shows ranks only: no numbers or bars. */
  counts?: boolean;
}) {
  // Board titles are unique on a page, so they make stable ids.
  const headingId = `board-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-[var(--radius-card)] border-2 border-border bg-surface p-5 shadow-card"
    >
      <h2 id={headingId} className="font-display text-xl font-semibold">
        {title}
      </h2>
      <p className="text-sm text-muted">{description}</p>
      {board.entries.length === 0 ? (
        <p className="mt-6 text-muted">{emptyText}</p>
      ) : (
        <ol className="mt-4 space-y-1">
          {board.entries.map((entry) => (
            <Row
              key={entry.id}
              entry={entry}
              max={board.max}
              unit={unit}
              people={people}
              highlight={entry.id === viewerId}
              counts={counts}
            />
          ))}
        </ol>
      )}
      {board.viewer && (
        <div className="mt-3 border-t-2 border-dashed border-border pt-3">
          <p className="mb-1 text-xs font-bold text-muted">Your position</p>
          <ol>
            <Row
              entry={board.viewer}
              max={board.max}
              unit={unit}
              people={people}
              highlight
              counts={counts}
            />
          </ol>
        </div>
      )}
      {footer && <div className="mt-4">{footer}</div>}
    </section>
  );
}
