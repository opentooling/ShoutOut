import { formatPoints } from "@/lib/format";

/** The points a shoutout includes, per recipient ("each" when there are several). */
export function PointsBadge({ points, recipients }: { points: number; recipients: number }) {
  return (
    <span
      className="rounded-full bg-sunny-soft px-2 py-0.5 text-xs font-bold text-on-sunny"
      title="Only the sender, the people thanked and admins see points"
    >
      🎁 {formatPoints(points)}
      {recipients > 1 ? " each" : ""}
    </span>
  );
}
