import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { runKeycloakSync, syncCredentialsFromEnv } from "@/server/users/sync-users";

export const dynamic = "force-dynamic";

const log = createLogger("user-sync");

function tokenMatches(header: string | null, expected: string | undefined): boolean {
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/** Triggered by the Helm CronJob. Protected by SHOUTOUT_SYNC_TOKEN. */
export async function POST(request: Request) {
  if (!tokenMatches(request.headers.get("authorization"), process.env.SHOUTOUT_SYNC_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const credentials = syncCredentialsFromEnv();
  if (!credentials) {
    return Response.json({ error: "keycloak sync is not configured" }, { status: 503 });
  }
  try {
    const result = await runKeycloakSync(getDb(), credentials);
    log.info("Scheduled sync complete", { ...result });
    return Response.json(result);
  } catch (error) {
    log.error("Scheduled sync failed", { error });
    return Response.json({ error: "sync failed" }, { status: 502 });
  }
}
