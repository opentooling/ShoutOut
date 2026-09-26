import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { buttonClasses } from "@/components/ui/button";
import { loadConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import { listPointsBalances } from "@/server/admin/points";
import { requireAdmin } from "../guard";

export const metadata: Metadata = { title: "Points" };

export default async function PointsPage() {
  const user = await requireAdmin();
  const { points } = loadConfig();
  const rows = await listPointsBalances(getDb());

  return (
    <AdminShell user={user} section="points">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-muted">
          {points.enabled
            ? `Everyone can give ${points.quarterlyBudget} points a quarter. `
            : "Points mode is off: nobody can give points, but balances are kept. "}
          Nothing can be spent yet, so each balance is everything that person has received. Points
          from shoutouts that were deleted, or hidden after a report, don&apos;t count.
        </p>
        <Link
          href="/admin/export/points"
          prefetch={false}
          className={buttonClasses({ variant: "secondary" })}
        >
          Download points.csv
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted">Nobody has given or received points yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border-2 border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted text-muted">
              <tr>
                <th className="px-4 py-2 font-bold">Person</th>
                <th className="px-4 py-2 text-right font-bold">Balance</th>
                <th className="px-4 py-2 text-right font-bold">Received this quarter</th>
                <th className="px-4 py-2 text-right font-bold">Given this quarter</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <Link href={`/people/${row.id}`} className="font-bold hover:underline">
                      {row.name}
                    </Link>
                    <span className="block text-xs text-muted">
                      {row.email}
                      {!row.active && " · no longer active"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-bold tabular-nums">{row.balance}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.receivedThisQuarter}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.givenThisQuarter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
