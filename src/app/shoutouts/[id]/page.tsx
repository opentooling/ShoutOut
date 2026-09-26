import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { addCommentAction, deleteCommentAction } from "@/app/actions/social";
import { AppHeader } from "@/components/layout/app-header";
import { FeedItemCard } from "@/components/shoutouts/feed-item";
import { CommentForm, CommentList } from "@/components/social/comments";
import { getDb } from "@/lib/db";
import { listComments } from "@/server/social/comments";
import { isAdmin } from "@/server/auth/roles";
import { getVisibleShoutout } from "@/server/shoutouts/feed";

export const metadata: Metadata = { title: "Shoutout" };

export default async function ShoutoutPage({ params }: PageProps<"/shoutouts/[id]">) {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }
  const { user } = session;
  const { id } = await params;
  const db = getDb();
  const now = new Date();
  const [shoutout, comments] = await Promise.all([
    getVisibleShoutout(db, user.id, id, now, { admin: isAdmin(user.roles) }),
    listComments(db, user.id, id),
  ]);
  if (!shoutout) {
    notFound();
  }

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        <Link href="/" className="text-sm font-bold text-muted hover:text-foreground">
          ← Back to the feed
        </Link>
        <FeedItemCard
          item={shoutout}
          viewerName={user.name ?? user.email ?? "You"}
          now={now}
          layout="stacked"
          showCommentLink={false}
        />
        <section
          id="comments"
          aria-labelledby="comments-heading"
          className="space-y-4 rounded-[var(--radius-card)] border-2 border-border bg-surface p-6"
        >
          <h2 id="comments-heading" className="font-display text-xl font-semibold">
            Comments{" "}
            {comments.length > 0 && <span className="text-muted">({comments.length})</span>}
          </h2>
          <CommentList comments={comments} deleteAction={deleteCommentAction} now={now} />
          <CommentForm action={addCommentAction.bind(null, shoutout.id)} />
        </section>
      </main>
    </>
  );
}
