import { formatDayMonth } from "@/lib/format";
import { cn } from "@/lib/cn";

const UNITS = {
  shoutouts: { text: "shoutouts left", label: "Shoutouts left this quarter" },
  points: { text: "points left to give", label: "Points left to give this quarter" },
};

export function BudgetMeter({
  allowance,
  remaining,
  resetsAt,
  unit = "shoutouts",
  className,
}: {
  allowance: number;
  remaining: number;
  resetsAt: Date;
  unit?: keyof typeof UNITS;
  className?: string;
}) {
  const percent = allowance === 0 ? 0 : Math.round((remaining / allowance) * 100);
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-bold">
          <span className="font-display text-2xl">{remaining}</span>
          <span className="text-muted">
            {" "}
            of {allowance} {UNITS[unit].text}
          </span>
        </p>
        <p className="text-sm text-muted">Resets {formatDayMonth(resetsAt)}</p>
      </div>
      <div
        role="progressbar"
        aria-label={UNITS[unit].label}
        aria-valuemin={0}
        aria-valuemax={allowance}
        aria-valuenow={remaining}
        className="h-3 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className={cn("h-full rounded-full", remaining === 0 ? "bg-coral" : "bg-sunny")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
