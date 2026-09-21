import { createLogger, type Logger } from "@/lib/logger";
import { roleConfigFromEnv } from "./roles";

type Env = Record<string, string | undefined>;

const TLS_CODES = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_GET_ISSUER_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

/** The innermost error code in a cause chain (fetch hides it under "fetch failed"). */
export function rootCode(error: unknown): string | undefined {
  let code: string | undefined;
  for (let current = error, depth = 0; current && depth < 6; depth++) {
    const candidate = (current as { code?: unknown }).code;
    if (typeof candidate === "string") code = candidate;
    current = (current as { cause?: unknown }).cause;
  }
  return code;
}

export function hintFor(code: string | undefined): string | undefined {
  if (!code) return undefined;
  if (TLS_CODES.has(code)) {
    return "Keycloak's TLS certificate isn't trusted. If it comes from a company CA, mount the CA bundle and set NODE_EXTRA_CA_CERTS (Helm: app.extraCaCerts).";
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return "The Keycloak host name doesn't resolve from inside the cluster; check AUTH_KEYCLOAK_ISSUER and cluster DNS.";
  }
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return "Keycloak isn't reachable from the app pod; check network policies, proxies and firewalls.";
  }
  return undefined;
}

/** Auth settings worth seeing at startup. Never includes secret values. */
export function authSummary(env: Env) {
  const roles = roleConfigFromEnv(env);
  return {
    appUrl: env.AUTH_URL,
    issuer: env.AUTH_KEYCLOAK_ISSUER,
    clientId: env.AUTH_KEYCLOAK_ID,
    clientSecretSet: Boolean(env.AUTH_KEYCLOAK_SECRET),
    authSecretSet: Boolean(env.AUTH_SECRET),
    rolesClient: roles.clientId,
    adminRole: roles.adminRole,
    extraCaCerts: env.NODE_EXTRA_CA_CERTS,
  };
}

/**
 * Logs the auth configuration and checks that Keycloak's discovery document is
 * reachable and names the same issuer. Sign-in fails in exactly these cases, but
 * Auth.js only reports it when someone tries to sign in.
 */
export async function checkAuthSetup({
  env = process.env,
  fetchImpl = fetch,
  log = createLogger("auth"),
  timeoutMs = 10_000,
}: {
  env?: Env;
  fetchImpl?: typeof fetch;
  log?: Logger;
  timeoutMs?: number;
} = {}): Promise<boolean> {
  const summary = authSummary(env);
  log.info("Auth configuration", summary);

  const missing = (
    [
      ["AUTH_URL", summary.appUrl],
      ["AUTH_SECRET", summary.authSecretSet],
      ["AUTH_KEYCLOAK_ISSUER", summary.issuer],
      ["AUTH_KEYCLOAK_ID", summary.clientId],
      ["AUTH_KEYCLOAK_SECRET", summary.clientSecretSet],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    log.error("Sign-in will fail: required settings are missing", { missing });
    return false;
  }

  const issuer = summary.issuer!.replace(/\/+$/, "");
  const url = `${issuer}/.well-known/openid-configuration`;
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      log.error("Keycloak discovery request failed", {
        url,
        status: response.status,
        hint: "Check AUTH_KEYCLOAK_ISSUER is the realm URL, e.g. https://sso.example.com/realms/acme",
      });
      return false;
    }
    const discovery = (await response.json()) as { issuer?: string };
    if (discovery.issuer?.replace(/\/+$/, "") !== issuer) {
      log.error("Keycloak reports a different issuer than configured; sign-in will be rejected", {
        configured: summary.issuer,
        reported: discovery.issuer,
        hint: "Set AUTH_KEYCLOAK_ISSUER to exactly the reported issuer. If Keycloak is behind a proxy, set its hostname (KC_HOSTNAME) so both match.",
      });
      return false;
    }
    log.info("Keycloak discovery OK", { issuer: discovery.issuer });
    return true;
  } catch (error) {
    const code = rootCode(error);
    log.error("Could not reach Keycloak", { url, errorCode: code, hint: hintFor(code), error });
    return false;
  }
}
