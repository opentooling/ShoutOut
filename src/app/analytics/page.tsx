import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { StatTile } from "@/components/charts/stat-tile";
import { SegmentedLinks } from "@/components/insights/segmented-links";
import { AppHeader } from "@/components/layout/app-header";
import { Avatar } from "@/components/ui/avatar";
import { loadConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import { formatDayMonth, formatMonthYear, formatRelativeTime } from "@/lib/format";
import { canViewAnalytics, isAdmin } from "@/server/auth/roles";
import {
  change,
  getCardBreakdown,
  getSummary,
  getTrend,
  getUnrecognised,
  getValueBreakdown,
  percent,
} from "@/server/insights/analytics";
import { ANALYTICS_RANGES, parseAnalyticsRange, rollingRange } from "@/server/insights/periods";

export const metadata: Metadata = { title: "Analytics" };

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border-2 border-border bg-surface p-5 shadow-card">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {description && <p className="text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }
  const { user } = session;
  if (!canViewAnalytics(user.roles, loadConfig().analyticsVisibility)) {
    notFound();
  }
  const days = parseAnalyticsRange((await searchParams).days);
  const now = new Date();
  const { current, previous } = rollingRange(days, now);
  const bucket = days > 90 ? "month" : "week";
  const admin = isAdmin(user.roles);
  const db = getDb();
  const [summary, before, trend, values, cards, unrecognised] = await Promise.all([
    getSummary(db, current),
    getSummary(db, previous),
    getTrend(db, current, bucket),
    getValueBreakdown(db, current),
    getCardBreakdown(db, current),
    admin ? getUnrecognised(db, current.start) : Promise.resolve([]),
  ]);

  return (
    <>
      <AppHeader user={user} />
      <main className="page-width flex-1 space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">Analytics</h1>
            <p className="text-muted">How recognition is flowing across the company.</p>
          </div>
          <SegmentedLinks
            label="Date range"
            current={String(days)}
            options={ANALYTICS_RANGES.map((d) => ({
              value: String(d),
              label: `Last ${d} days`,
              href: `/analytics?days=${d}`,
            }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Shoutouts sent"
            value={summary.shoutouts}
            change={change(summary.shoutouts, before.shoutouts)}
          />
          <StatTile
            label="People recognised"
            value={summary.recognitions}
            change={change(summary.recognitions, before.recognitions)}
            hint="Each recipient counts once per shoutout"
          />
          <StatTile
            label="Giving recognition"
            value={percent(summary.givers, summary.activePeople)}
            suffix="%"
            hint={`${summary.givers} of ${summary.activePeople} people sent one`}
          />
          <StatTile
            label="Received recognition"
            value={percent(summary.receivers, summary.activePeople)}
            suffix="%"
            hint={`${summary.receivers} of ${summary.activePeople} people received one`}
          />
        </div>

        <Card
          title={`Shoutouts per ${bucket}`}
          description={bucket === "week" ? "Weeks start on Monday (UTC)" : "Calendar months (UTC)"}
        >
          <ColumnChart
            title={`Shoutouts per ${bucket}`}
            unit="shoutouts"
            points={trend.map((point) => ({
              label:
                bucket === "week"
                  ? `Week of ${formatDayMonth(point.start)}`
                  : formatMonthYear(point.start),
              tick: bucket === "week" ? formatDayMonth(point.start) : formatMonthYear(point.start),
              value: point.count,
            }))}
          />
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Company values" description="Shoutouts tagged with each value">
            <BarList title="Shoutouts per company value" unit="shoutouts" items={values} />
          </Card>
          <Card title="Cards" description="Which cards people pick">
            <BarList title="Shoutouts per card" unit="shoutouts" items={cards} />
          </Card>
        </div>

        {admin && (
          <Card
            title="Not recognised recently"
            description={`Active people with no shoutout received in the last ${days} days. Only admins can see this.`}
          >
            {unrecognised.length === 0 ? (
              <p className="text-muted">Everyone has been recognised in this period. 🎉</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {unrecognised.map((person) => (
                  <li key={person.id}>
                    <Link
                      href={`/people/${person.id}`}
                      className="flex items-center gap-3 rounded-2xl bg-surface-muted p-3 hover:underline"
                    >
                      <Avatar name={person.name} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-bold">{person.name}</span>
                        <span className="block text-sm text-muted">
                          {person.lastRecognisedAt
                            ? `Last recognised ${formatRelativeTime(person.lastRecognisedAt, now)}`
                            : "Never recognised"}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        <p className="text-xs text-muted">
          Includes private shoutouts as numbers only. All times are UTC.
        </p>
      </main>
    </>
  );
}
