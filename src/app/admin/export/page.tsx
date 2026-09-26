import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { buttonClasses } from "@/components/ui/button";
import { LEADERBOARD_PERIODS, PERIOD_LABELS } from "@/server/insights/periods";
import { requireAdmin } from "../guard";

export const metadata: Metadata = { title: "Export" };

const inputClass = "mt-1 w-full rounded-xl border-2 border-border bg-surface px-3 py-2";

function DateFields({ id }: { id: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label htmlFor={`${id}-from`} className="text-sm font-bold">
          From
        </label>
        <input id={`${id}-from`} name="from" type="date" className={inputClass} />
      </div>
      <div>
        <label htmlFor={`${id}-to`} className="text-sm font-bold">
          To
        </label>
        <input id={`${id}-to`} name="to" type="date" className={inputClass} />
      </div>
    </div>
  );
}

function ExportCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-[var(--radius-card)] border-2 border-border bg-surface p-5">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="text-sm text-muted">{description}</p>
      {children}
    </section>
  );
}

export default async function ExportPage() {
  const user = await requireAdmin();
  return (
    <AdminShell user={user} section="export">
      <p className="text-muted">
        CSV files for HR reporting. Dates are inclusive and in UTC; leave them empty for everything.
        Deleted and moderated shoutouts are left out, and private messages are not exported.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        <ExportCard
          title="Shoutouts"
          description="One row per shoutout: people, card, value, visibility and message."
        >
          <form method="get" action="/admin/export/shoutouts" className="space-y-3">
            <DateFields id="shoutouts" />
            <button type="submit" className={buttonClasses({ variant: "secondary" })}>
              Download shoutouts.csv
            </button>
          </form>
        </ExportCard>
        <ExportCard
          title="People"
          description="One row per person: shoutouts received and sent, and when they last were."
        >
          <form method="get" action="/admin/export/people" className="space-y-3">
            <DateFields id="people" />
            <button type="submit" className={buttonClasses({ variant: "secondary" })}>
              Download people.csv
            </button>
          </form>
        </ExportCard>
        <ExportCard title="Leaderboards" description="Full rankings for every leaderboard.">
          <form method="get" action="/admin/export/leaderboards" className="space-y-3">
            <div>
              <label htmlFor="export-period" className="text-sm font-bold">
                Period
              </label>
              <select
                id="export-period"
                name="period"
                defaultValue="quarter"
                className={inputClass}
              >
                {LEADERBOARD_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {PERIOD_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={buttonClasses({ variant: "secondary" })}>
              Download leaderboards.csv
            </button>
          </form>
        </ExportCard>
      </div>
    </AdminShell>
  );
}
