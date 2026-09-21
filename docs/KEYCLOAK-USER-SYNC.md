# Setting up the people sync with your own Keycloak

ShoutOut copies people from Keycloak so that everyone can be recognised before
they sign in for the first time. The sync runs when the app starts and then
hourly as a CronJob (`userSync.schedule`).

The sync doesn't use a separate user account. It signs in as the ShoutOut
client itself, through Keycloak's **service account** for that client, using the
same client ID and secret as sign-in (`auth.clientId`, and
`keycloak-client-secret` in the secrets). All you need to do is turn on the
service account and give it permission to read users.

These steps use the Keycloak 2x admin console. The examples use the client
`shoutout-web` and the realm `acme`; replace them with your own.

## 1. Let the client act on its own behalf

1. Open the admin console and switch to your realm (top-left dropdown).
2. Go to **Clients** → `shoutout-web` → **Settings**.
3. Under **Capability config**:
   - **Client authentication**: **On** (the client needs a secret).
   - **Authentication flow**: tick **Service accounts roles**. Keep
     **Standard flow** ticked, because sign-in uses it.
4. Click **Save**. A **Service accounts roles** tab now appears on the client.

## 2. Allow it to read the user list

1. On the client, open the **Service accounts roles** tab → **Assign role**.
2. Change the filter to **Filter by clients**.
3. Search for `view-users`, tick the one whose client is **realm-management**,
   then click **Assign**. `view-users` includes `query-users`, which the sync
   also needs.

That is read-only access. Don't assign `manage-users` or `realm-admin`.

## 3. Copy the client secret

Go to **Clients** → `shoutout-web` → **Credentials** and copy the
**Client secret**. The app and the sync share it.

## 4. Test it before deploying

Run these from a machine that can reach Keycloak, ideally inside the cluster.
First set your values:

```bash
export KC=https://sso.example.com REALM=acme CLIENT=shoutout-web SECRET='paste-secret-here'
```

Get a token for the service account:

```bash
TOKEN=$(curl -s -d grant_type=client_credentials -d client_id=$CLIENT -d client_secret=$SECRET \
  "$KC/realms/$REALM/protocol/openid-connect/token" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
```

List a few users with it:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$KC/admin/realms/$REALM/users?max=3&briefRepresentation=true"
```

A list of users means it works. Otherwise:

| Result                                                            | Cause                                                     |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| `unauthorized_client`                                             | **Service accounts roles** isn't ticked (step 1)          |
| `invalid_client` / HTTP 401                                       | Wrong client secret                                       |
| HTTP 403 on the user list                                         | `view-users` isn't assigned (step 2)                      |
| HTTP 404 `Realm does not exist`                                   | Wrong realm name or URL                                   |
| Certificate error (e.g. `unable to get local issuer certificate`) | Keycloak uses a company certificate authority; see step 5 |

Keycloak 17 and earlier have `/auth` in the path: `$KC/auth/realms/...`.

## 5. Give the secret to ShoutOut

Create the secret the chart reads:

```bash
kubectl -n shoutout create secret generic shoutout-secrets \
  --from-literal=keycloak-client-secret="$SECRET" \
  --from-literal=auth-secret="$(openssl rand -base64 32)" \
  --from-literal=sync-token="$(openssl rand -base64 32)"
```

Then point the chart at it, as in
[`deploy/examples/values-production.yaml`](../deploy/examples/values-production.yaml):

```yaml
secrets:
  existingSecret: shoutout-secrets
auth:
  issuer: https://sso.example.com/realms/acme
  clientId: shoutout-web
userSync:
  enabled: true
```

If Keycloak uses a company certificate authority, trust it too:

```bash
kubectl -n shoutout create configmap corp-ca --from-file=ca.crt=corp-ca.pem
```

```yaml
app:
  extraCaCerts:
    configMap: corp-ca
```

## 6. Run a sync now and check it

Start the CronJob straight away instead of waiting for the next hour:

```bash
kubectl -n shoutout create job sync-now --from=cronjob/shoutout-user-sync
```

Then read the sync logs:

```bash
kubectl -n shoutout logs deploy/shoutout-app | grep '"scope":"user-sync"'
```

Look for `Scheduled sync complete` with the number of people created, updated,
deactivated and skipped. If it fails, the log line includes Keycloak's own
error message and a hint about the likely cause. The startup sync logs
`Startup sync complete` the same way.

Delete the one-off job afterwards:

```bash
kubectl -n shoutout delete job sync-now
```

## Things that may apply to your setup

- **Users need an email address in Keycloak.** Users without one are skipped and
  counted as `skipped`.
- **LDAP/AD federation with "Import users" off:** Keycloak only lists users it
  has already cached, so the sync may only find people who have signed in
  before. They still appear in ShoutOut as soon as they sign in. For full
  coverage, ask your Keycloak admins to turn import on.
- **People who leave:** users that disappear from Keycloak, or are disabled
  there, are marked inactive in ShoutOut. Their shoutouts stay. The sync never
  deactivates everyone at once if Keycloak returns an empty list.
- **Service accounts not allowed on the sign-in client:** set
  `userSync.enabled: false`. People then appear in ShoutOut the first time they
  sign in, and nothing else breaks.

## Related

- [README: Access](../README.md#access): client roles for admins.
- [README: Troubleshooting sign-in](../README.md#troubleshooting-sign-in).
