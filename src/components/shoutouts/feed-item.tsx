import Link from "next/link";
import { deleteShoutoutAction } from "@/app/actions/shoutouts";
import { toggleReactionAction } from "@/app/actions/social";
import { toCardDesign } from "@/components/cards/designs";
import { ShoutoutCard } from "@/components/cards/shoutout-card";
import { ReactionBar } from "@/components/social/reaction-bar";
import { buttonClasses } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import type { FeedItem } from "@/server/shoutouts/feed";
import { DeleteShoutoutButton } from "./delete-button";
import { PointsBadge } from "./points-badge";

const profileLink = (person: { id: string; name: string }) => ({
  name: person.name,
  href: `/people/${person.id}`,
});

export function FeedItemCard({
  item,
  viewerName,
  now = new Date(),
  layout = "horizontal",
  showCommentLink = true,
}: {
  item: FeedItem;
  viewerName: string;
  now?: Date;
  layout?: "horizontal" | "stacked";
  showCommentLink?: boolean;
}) {
  return (
    <ShoutoutCard
      layout={layout}
      design={toCardDesign(item.card)}
      from={profileLink(item.sender)}
      to={item.recipients.map(profileLink)}
      values={item.values.map((value) => value.name)}
      message={item.message}
      meta={
        <p className="flex items-center gap-2 text-sm text-muted">
          {item.visibility === "PRIVATE" && (
            <span className="rounded-full bg-lilac-soft px-2 py-0.5 text-xs font-bold text-lilac-strong">
              Private
            </span>
          )}
          {item.points !== null && (
            <PointsBadge points={item.points} recipients={item.recipients.length} />
          )}
          <Link href={`/shoutouts/${item.id}`} className="hover:underline">
            <time dateTime={item.createdAt.toISOString()} title={item.createdAt.toUTCString()}>
              {formatRelativeTime(item.createdAt, now)}
            </time>
          </Link>
          {item.editedAt && <span>· edited</span>}
        </p>
      }
      actions={
        <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-border pt-3">
          <ReactionBar
            reactions={item.reactions}
            viewerName={viewerName}
            toggle={toggleReactionAction.bind(null, item.id)}
          />
          <div className="flex items-center gap-1">
            {showCommentLink && (
              <Link
                href={`/shoutouts/${item.id}#comments`}
                className={buttonClasses({ variant: "ghost", size: "sm" })}
              >
                💬{" "}
                {item.commentCount === 0
                  ? "Comment"
                  : `${item.commentCount} comment${item.commentCount === 1 ? "" : "s"}`}
              </Link>
            )}
            {item.canReport && (
              <Link
                href={`/shoutouts/${item.id}/report`}
                className={buttonClasses({ variant: "ghost", size: "sm", className: "text-muted" })}
              >
                Report
              </Link>
            )}
            {item.canModify && (
              <>
                <Link
                  href={`/shoutouts/${item.id}/edit`}
                  className={buttonClasses({ variant: "ghost", size: "sm" })}
                >
                  Edit
                </Link>
                <DeleteShoutoutButton action={deleteShoutoutAction.bind(null, item.id)} />
              </>
            )}
          </div>
        </div>
      }
    />
  );
}
