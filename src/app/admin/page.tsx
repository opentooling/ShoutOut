import type { Metadata } from "next";
import { resolveReportAction } from "@/app/actions/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { toCardDesign } from "@/components/cards/designs";
import { ShoutoutCard } from "@/components/cards/shoutout-card";
import { buttonClasses } from "@/components/ui/button";
import { getDb } from "@/lib/db";
import { formatRelativeTime } from "@/lib/format";
import {
  listPendingCases,
  listResolvedCases,
  REPORT_REASONS,
  type ModerationCase,
} from "@/server/admin/moderation";
import { requireAdmin } from "./guard";

export const metadata: Metadata = { title: "Moderation" };

const reasonLabel = (reason: string) =>
  REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;

function CaseCard({
  item,
  now,
  children,
}: {
  item: ModerationCase;
  now: Date;
  children?: React.ReactNode;
}) {
  const { shoutout } = item;
  return (
    <li className="grid gap-4 rounded-[var(--radius-card)] border-2 border-border bg-surface p-4 md:grid-cols-[1fr_18rem]">
      <ShoutoutCard
        layout="horizontal"
        className="shadow-none"
        design={toCardDesign(shoutout.card)}
        from={shoutout.sender.name}
        to={shoutout.recipients.map((r) => r.name)}
        values={shoutout.values.map((value) => value.name)}
        message={shoutout.message}
        meta={
          <span className="text-sm text-muted">
            {shoutout.visibility === "PRIVATE" ? "Private · " : ""}
            {formatRelativeTime(shoutout.createdAt, now)}
          </span>
        }
      />
      <div className="space-y-3">
        <ul className="space-y-2">
          {item.reports.map((report) => (
            <li key={report.id} className="rounded-xl bg-surface-muted p-3 text-sm">
              <p>
                <span className="font-bold">{reasonLabel(report.reason)}</span>
                <span className="text-muted">
                  {" "}
                  · {report.reporter.name} · {formatRelativeTime(report.createdAt, now)}
                </span>
              </p>
              {report.note && <p className="mt-1 break-words">&ldquo;{report.note}&rdquo;</p>}
              {report.resolvedBy && (
                <p className="mt-1 text-muted">
                  {report.resolution === "RESTORED" ? "Restored" : "Removed"} by{" "}
                  {report.resolvedBy.name}
                </p>
              )}
            </li>
          ))}
        </ul>
        {children}
      </div>
    </li>
  );
}

export default async function ModerationPage({ searchParams }: PageProps<"/admin">) {
  const user = await requireAdmin();
  const { notice } = await searchParams;
  const db = getDb();
  const now = new Date();
  const [pending, resolved] = await Promise.all([listPendingCases(db), listResolvedCases(db)]);

  return (
    <AdminShell
      user={user}
      section="moderation"
      pendingCount={pending.length}
      notice={typeof notice === "string" ? notice : undefined}
    >
      <section className="space-y-4" aria-labelledby="pending-heading">
        <h2 id="pending-heading" className="font-display text-2xl font-semibold">
          Waiting for review
        </h2>
        <p className="text-sm text-muted">
          Reported shoutouts are hidden from everyone until you restore or remove them.
        </p>
        {pending.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border-2 border-dashed border-border p-8 text-center text-muted">
            Nothing to review. 🎉
          </p>
        ) : (
          <ul className="space-y-4" aria-label="Reported shoutouts">
            {pending.map((item) => (
              <CaseCard key={item.shoutout.id} item={item} now={now}>
                <div className="flex gap-2">
                  <form action={resolveReportAction.bind(null, item.shoutout.id, "RESTORED")}>
                    <button
                      type="submit"
                      className={buttonClasses({ variant: "secondary", size: "sm" })}
                    >
                      Restore
                    </button>
                  </form>
                  <form action={resolveReportAction.bind(null, item.shoutout.id, "REMOVED")}>
                    <button
                      type="submit"
                      className={buttonClasses({
                        variant: "outline",
                        size: "sm",
                        className: "text-coral-strong",
                      })}
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </CaseCard>
            ))}
          </ul>
        )}
      </section>
      {resolved.length > 0 && (
        <section className="space-y-4" aria-labelledby="resolved-heading">
          <h2 id="resolved-heading" className="font-display text-2xl font-semibold">
            Recently reviewed
          </h2>
          <ul className="space-y-4" aria-label="Reviewed shoutouts">
            {resolved.map((item) => (
              <CaseCard key={item.shoutout.id} item={item} now={now} />
            ))}
          </ul>
        </section>
      )}
    </AdminShell>
  );
}
