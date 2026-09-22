export interface KeycloakUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
}

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
  const base = keycloakAdminBase(issuer);
  const users: KeycloakUser[] = [];

  for (let first = 0; ; first += pageSize) {
    // Proactively refresh the token before it expires if credentials are available
    if (credentials && Date.now() - tokenIssuedAt >= tokenRefreshIntervalMs) {
      token = await fetchServiceToken(credentials, fetchImpl);
      tokenIssuedAt = Date.now();
    }

    let response = await request(
      fetchImpl,
      `${base}/users?first=${first}&max=${pageSize}&briefRepresentation=true`,
      { headers: { authorization: `Bearer ${token}` } },
      "Keycloak user listing",
    );

    // If the token expired midway (HTTP 401) and we have credentials, refresh and retry once
    if (response.status === 401 && credentials) {
      token = await fetchServiceToken(credentials, fetchImpl);
      tokenIssuedAt = Date.now();
      response = await request(
        fetchImpl,
        `${base}/users?first=${first}&max=${pageSize}&briefRepresentation=true`,
        { headers: { authorization: `Bearer ${token}` } },
        "Keycloak user listing",
      );
    }

    await expectOk(response, "Keycloak user listing");
    const page = (await response.json()) as KeycloakUser[];
    users.push(...page);
    if (page.length < pageSize) return users;
  }
}
