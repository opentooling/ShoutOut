import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { recordAudit } from "@/server/admin/audit";
import { exportLeaderboardsCsv, exportPeopleCsv, exportShoutoutsCsv } from "@/server/admin/export";
import { exportPointsCsv } from "@/server/admin/points";
import { isAdmin } from "@/server/auth/roles";
import { parsePeriod, type DateRange } from "@/server/insights/periods";
import { parseDay } from "@/server/shoutouts/filters";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

function rangeFrom(params: URLSearchParams): DateRange {
  const from = parseDay(params.get("from") ?? undefined);
  const to = parseDay(params.get("to") ?? undefined);
  return { start: from, end: to ? new Date(to.getTime() + DAY_MS) : undefined };
}

export async function GET(request: Request, { params }: RouteContext<"/admin/export/[kind]">) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return new Response("Not found", { status: 404 });
  }
  const { kind } = await params;
  const search = new URL(request.url).searchParams;
  const db = getDb();

  let csv: string;
  let details: Record<string, string>;
  if (kind === "shoutouts" || kind === "people") {
    const range = rangeFrom(search);
    csv =
      kind === "shoutouts" ? await exportShoutoutsCsv(db, range) : await exportPeopleCsv(db, range);
    details = { kind, from: search.get("from") ?? "", to: search.get("to") ?? "" };
  } else if (kind === "points") {
    csv = await exportPointsCsv(db);
    details = { kind };
  } else if (kind === "leaderboards") {
    const period = parsePeriod(search.get("period"));
    csv = await exportLeaderboardsCsv(db, period);
    details = { kind, period };
  } else {
    return new Response("Not found", { status: 404 });
  }

  await recordAudit(db, {
    actorId: session.user.id,
    action: "export.downloaded",
    targetType: "export",
    targetId: kind,
    details,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="shoutout-${kind}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
