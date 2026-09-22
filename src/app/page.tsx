import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LeaderboardBoard } from "@/components/insights/leaderboard-board";
import { AppHeader } from "@/components/layout/app-header";
import { BudgetMeter } from "@/components/shoutouts/budget-meter";
import { FeedFilters } from "@/components/shoutouts/feed-filters";
import { FeedList } from "@/components/shoutouts/feed-list";
import { Notice } from "@/components/shoutouts/notice";
import { buttonClasses } from "@/components/ui/button";
import { loadConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import { topRecipients } from "@/server/insights/leaderboard";
import { periodRange } from "@/server/insights/periods";
import { getBudget } from "@/server/shoutouts/budget";
import { listActiveCards, listActiveValues } from "@/server/shoutouts/catalog";
import { listFeed } from "@/server/shoutouts/feed";
import { parseFeedFilters, withParams } from "@/server/shoutouts/filters";
import { findPerson } from "@/server/users/search";

function param(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }
  const { user } = session;
  const params = await searchParams;
  const cursor = param(params.cursor);
  const { filters, raw, active } = parseFeedFilters(params);
  const db = getDb();
  const now = new Date();
  const [budget, feed, cards, values, person, topThisMonth] = await Promise.all([
    getBudget(db, user.id, loadConfig().quarterlyBudget, now),
    listFeed(db, user.id, { cursor, now, filters }),
    listActiveCards(db),
    listActiveValues(db),
    filters.personId ? findPerson(db, filters.personId) : null,
    topRecipients(db, periodRange("month", now), 5, user.id),
  ]);
  const firstName = user.name?.split(" ")[0] ?? "there";
  const viewerName = user.name ?? user.email ?? "You";

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <Notice code={param(params.notice)} />
        {/* Wide screens: feed on the left, a sticky sidebar on the right. */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
          <aside
            aria-label="Your shoutouts"
            className="flex flex-col gap-6 lg:sticky lg:top-24 lg:order-2"
          >
            <section className="rounded-[var(--radius-card)] border-2 border-border bg-surface p-6 shadow-card sm:p-8 lg:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 lg:flex-col lg:items-stretch">
                <div>
                  <h1 className="font-display text-3xl font-semibold">Hi {firstName} 👋</h1>
                  <p className="mt-1 text-muted">Who made your day better recently?</p>
                </div>
                {budget.remaining > 0 ? (
                  <Link href="/shoutouts/new" className={buttonClasses({ size: "lg" })}>
                    Send a shoutout
                  </Link>
                ) : (
                  <p className="font-bold text-muted">
                    You&apos;ve used all your shoutouts this quarter
                  </p>
                )}
              </div>
              <BudgetMeter
                className="mt-6"
                allowance={budget.allowance}
                remaining={budget.remaining}
                resetsAt={budget.resetsAt}
              />
              <p className="mt-4 text-sm text-muted">
                New here?{" "}
                <Link href="/guide" className="font-bold text-teal-strong hover:underline">
                  Read the user guide
                </Link>
              </p>
            </section>
            <div className="hidden lg:block">
              <LeaderboardBoard
                title="Top this month"
                description="Most recognised colleagues"
                unit="shoutouts received"
                board={topThisMonth}
                viewerId={user.id}
                emptyText="Nobody yet this month. Send the first shoutout!"
                footer={
                  <Link
                    href="/leaderboard"
                    className="text-sm font-bold text-teal-strong hover:underline"
                  >
                    See the full leaderboard →
                  </Link>
                }
              />
            </div>
          </aside>

          <section aria-labelledby="feed-heading" className="min-w-0 space-y-4 lg:order-1">
            <h2 id="feed-heading" className="font-display text-2xl font-semibold">
              {active ? "Matching shoutouts" : "Latest shoutouts"}
            </h2>
            <FeedFilters
              // Remount when filters change so uncontrolled inputs reset (e.g. after "Clear").
              key={withParams(raw, {})}
              options={{ cards: cards.map(({ id, title }) => ({ id, title })), values }}
              initial={raw}
              person={person}
              active={active}
            />
            <FeedList
              items={feed.items}
              viewerName={viewerName}
              now={now}
              nextHref={feed.nextCursor ? `/${withParams(raw, { cursor: feed.nextCursor })}` : null}
              emptyText={
                active
                  ? "No shoutouts match those filters."
                  : cursor
                    ? "No more shoutouts."
                    : "No shoutouts yet. Be the first to say thanks!"
              }
            />
          </section>
        </div>
      </main>
    </>
  );
}
