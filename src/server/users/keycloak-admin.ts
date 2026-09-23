import { createLogger } from "@/lib/logger";

export interface KeycloakUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
}

const log = createLogger("keycloak-admin");

export interface KeycloakClientCredentials {
  issuer: string;
  clientId: string;
  clientSecret: string;
}

type Fetch = typeof fetch;

/** http://host/realms/acme -> http://host/admin/realms/acme */
export function keycloakAdminBase(issuer: string): string {
  const url = new URL(issuer);
  const match = url.pathname.match(/^(.*)\/realms\/([^/]+)\/?$/);
  if (!match) {
    throw new Error(`Not a Keycloak realm issuer URL: ${issuer}`);
  }
  return `${url.origin}${match[1]}/admin/realms/${match[2]}`;
}

const HINTS: Record<number, string> = {
  400: "check the client id and that 'Service accounts' is enabled on the client",
  401: "check the client secret (AUTH_KEYCLOAK_SECRET) matches the Keycloak client's credentials",
  403: "give the client's service account the realm-management 'view-users' role",
  404: "check AUTH_KEYCLOAK_ISSUER points at the realm, e.g. https://sso.example.com/realms/acme",
};

/** Error for a non-2xx Keycloak response, with Keycloak's own explanation and a hint. */
export class KeycloakHttpError extends Error {
  constructor(
    readonly what: string,
    readonly status: number,
    readonly body: string,
  ) {
    const hint = HINTS[status];
    super(
      `${what} failed with HTTP ${status}${body ? `: ${body}` : ""}${hint ? ` (hint: ${hint})` : ""}`,
    );
    this.name = "KeycloakHttpError";
  }
}

async function expectOk(response: Response, what: string): Promise<Response> {
  if (!response.ok) {
    const body = (await response.text().catch(() => "")).trim().slice(0, 300);
    throw new KeycloakHttpError(what, response.status, body);
  }
  return response;
}

/** fetch() that names the URL it failed to reach; the real reason stays in `cause`. */
async function request(fetchImpl: Fetch, url: string, init: RequestInit, what: string) {
  try {
    return await fetchImpl(url, init);
  } catch (error) {
    throw new Error(`${what}: could not reach ${new URL(url).origin}`, { cause: error });
  }
}

/** Gets an access token for the client's service account (client credentials grant). */
export async function fetchServiceToken(
  { issuer, clientId, clientSecret }: KeycloakClientCredentials,
  fetchImpl: Fetch = fetch,
): Promise<string> {
  const response = await request(
    fetchImpl,
    `${issuer.replace(/\/+$/, "")}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    },
    "Keycloak token request",
  );
  await expectOk(response, "Keycloak token request");
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error("Keycloak token response had no access_token");
  }
  return body.access_token;
}

/** Gets the total number of users in the realm. */
export async function fetchUserCount(
  { issuer, token }: { issuer: string; token: string },
  fetchImpl: Fetch = fetch,
): Promise<number> {
  const base = keycloakAdminBase(issuer);
  const response = await request(
    fetchImpl,
    `${base}/users/count`,
    { headers: { authorization: `Bearer ${token}` } },
    "Keycloak user count",
  );
  await expectOk(response, "Keycloak user count");
  const data: unknown = await response.json().catch(async () => {
    const text = await response.text();
    return Number(text);
  });
  const count =
    typeof data === "number"
      ? data
      : typeof data === "object" && data !== null && "count" in data
        ? Number((data as { count: unknown }).count)
        : Number(data);
  if (Number.isNaN(count)) {
    throw new Error(`Keycloak user count response was not a number: ${JSON.stringify(data)}`);
  }
  return count;
}

export interface FetchAllUsersOptions {
  issuer?: string;
  token?: string;
  credentials?: KeycloakClientCredentials;
  pageSize?: number;
  tokenRefreshIntervalMs?: number;
}

/** Lists every user in the realm, page by page, refreshing the service token as needed. */
export async function fetchAllUsers(
  options: FetchAllUsersOptions,
  fetchImpl: Fetch = fetch,
): Promise<KeycloakUser[]> {
  const {
    credentials,
    pageSize = 100,
    tokenRefreshIntervalMs = 4 * 60 * 1000, // Proactively refresh after 4 minutes
  } = options;

  const issuer = options.issuer ?? credentials?.issuer;
  if (!issuer) {
    throw new Error("Neither issuer nor credentials provided to fetchAllUsers");
  }

  let token = options.token;
  if (!token && credentials) {
    token = await fetchServiceToken(credentials, fetchImpl);
  }
  if (!token) {
    throw new Error("Neither token nor credentials provided to fetchAllUsers");
  }

  let tokenIssuedAt = Date.now();
  const getOrRefreshToken = async (force = false): Promise<string> => {
    if (credentials && (force || Date.now() - tokenIssuedAt >= tokenRefreshIntervalMs)) {
      token = await fetchServiceToken(credentials, fetchImpl);
      tokenIssuedAt = Date.now();
    }
    return token!;
  };

  const base = keycloakAdminBase(issuer);

  // 1. Query total count first
  const countUrl = `${base}/users/count`;
  log.info("Requesting Keycloak user count", { url: countUrl });

  let countResponse = await request(
    fetchImpl,
    countUrl,
    { headers: { authorization: `Bearer ${await getOrRefreshToken()}` } },
    "Keycloak user count",
  );

  if (countResponse.status === 401 && credentials) {
    const retryCountUrl = `${base}/users/count?enabled=true`;
    log.info("Keycloak token expired during count; refreshing token and retrying", {
      url: retryCountUrl,
    });
    countResponse = await request(
      fetchImpl,
      retryCountUrl,
      { headers: { authorization: `Bearer ${await getOrRefreshToken(true)}` } },
      "Keycloak user count",
    );
  }

  await expectOk(countResponse, "Keycloak user count");
  const countData: unknown = await countResponse.json().catch(async () => {
    const text = await countResponse.text();
    return Number(text);
  });
  const totalCount =
    typeof countData === "number"
      ? countData
      : typeof countData === "object" && countData !== null && "count" in countData
        ? Number((countData as { count: unknown }).count)
        : Number(countData);

  if (Number.isNaN(totalCount)) {
    throw new Error(`Keycloak user count response was not a number: ${JSON.stringify(countData)}`);
  }

  log.info("Keycloak user count determined", { expectedUsers: totalCount });

  if (totalCount <= 0) {
    log.info("No Keycloak users to fetch", { expectedUsers: totalCount });
    return [];
  }

  const users: KeycloakUser[] = [];

  // 2. Fetch pages, making an exact query for remaining users at the end of the stream
  for (let first = 0; first < totalCount; first += pageSize) {
    const count = Math.min(pageSize, totalCount - first);
    const url = `${base}/users?first=${first}&max=${count}&enabled=true&briefRepresentation=true`;

    log.info("Requesting Keycloak user page", {
      url,
      first,
      count,
      expectedUsers: totalCount,
    });

    let response = await request(
      fetchImpl,
      url,
      { headers: { authorization: `Bearer ${await getOrRefreshToken()}` } },
      "Keycloak user listing",
    );

    // If the token expired midway (HTTP 401) and we have credentials, refresh and retry once
    if (response.status === 401 && credentials) {
      log.info("Keycloak token expired during user listing; refreshing token and retrying", {
        url,
        first,
      });
      response = await request(
        fetchImpl,
        url,
        { headers: { authorization: `Bearer ${await getOrRefreshToken(true)}` } },
        "Keycloak user listing",
      );
    }

    await expectOk(response, "Keycloak user listing");
    const page = (await response.json()) as KeycloakUser[];
    users.push(...page);

    log.info("Received Keycloak user page", {
      first,
      count,
      received: page.length,
      totalFetched: users.length,
      expectedUsers: totalCount,
    });

    if (page.length < count || users.length >= totalCount) {
      break;
    }
  }

  log.info("Completed fetching Keycloak users", {
    totalFetched: users.length,
    expectedUsers: totalCount,
  });

  return users;
}
