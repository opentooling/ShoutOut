# ShoutOut

Recognise the people who make work better. ShoutOut is an internal kudos
platform: send a colleague a card, tag a company value and say thanks.

See [docs/PRODUCT.md](docs/PRODUCT.md) for scope and milestones and
[docs/BRAND.md](docs/BRAND.md) for the brand guidelines (live style guide at `/brand`).

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS 4) — UI and server in one app
- **Auth.js v5** with **Keycloak** (OIDC); everyone who signs in is a user, admins need a client role
- **PostgreSQL 17** with plain SQL via [`pg`](https://node-postgres.com) (no ORM); migrations are `.sql` files in `db/migrations`
- **Vitest** (unit, component, integration with Testcontainers) and **Playwright** (E2E)
- **Docker** images and a **Helm** chart (app + PostgreSQL + Keycloak)

## Local development

Requirements: Node 22, Docker (or Podman), k3d, kubectl, Helm.

```bash
npm install
npm run dev        # needs DATABASE_URL and AUTH_* env vars in .env.local
```

### Tests

```bash
npm run test:coverage   # unit + component + integration; fails below 90% coverage
npm run test:e2e        # Playwright against http://shoutout.localtest.me
```

Integration tests start PostgreSQL in a container via Testcontainers, so Docker
or Podman must be running.

### Database migrations

Schema changes are plain SQL files in `db/migrations`, applied in filename order by
`db/migrate.mjs` (each in a transaction, tracked in `schema_migrations`). In Kubernetes
the app pod's init container runs them; locally:

```bash
npm run db:migrate   # uses DATABASE_URL from the environment or .env
```

To change the schema, add a new file such as `db/migrations/20261001120000_add_x.sql`.
Never edit a migration that has already been applied.

### Security checks

```bash
npm run audit:deps                                   # npm audit, fails on high/critical
scripts/security-scan.sh shoutout:tag   # + Trivy image scan
```

`deploy/local/deploy.sh` runs both before deploying (skip with `SKIP_SECURITY_SCAN=1`).
CI runs `npm audit` and a Trivy scan of both images on every PR and weekly, and
Dependabot opens update PRs for npm packages, base images and GitHub Actions.
Images drop npm/yarn from the runtime and apply Alpine security updates. Accepted
findings go in `.trivyignore` with a reason and review date.

### Deploy to local Kubernetes (k3d)

```bash
deploy/local/deploy.sh
```

This creates the `shoutout` k3d cluster if needed, builds the app image,
loads it into the cluster, installs the Helm chart and runs `helm test`.
Keycloak only imports the realm on first start; after changing realm settings run
`RESET_KEYCLOAK_REALM=1 deploy/local/deploy.sh` to re-import it (local only).

| URL                          | What                        |
| ---------------------------- | --------------------------- |
| http://shoutout.localtest.me | ShoutOut                    |
| http://auth.localtest.me     | Keycloak (realm `shoutout`) |

Optional demo data (about six months of shoutouts, so leaderboards and analytics have something to show):

```bash
deploy/local/seed-demo.sh           # add
deploy/local/seed-demo.sh --remove  # remove
```

Demo users (local only, password `shoutout`): `alice` (admin), `bob`, `carol`,
`dave`, `erin`, `frank`, `grace`, `henry`.

Keycloak admin console password:

```bash
kubectl -n shoutout get secret shoutout-secrets -o jsonpath='{.data.keycloak-admin-password}' | base64 -d
```

## Access

- **Everyone who can sign in is a user.** No Keycloak role or directory (AD) group
  is needed to send and receive shoutouts.
- **Admins need a client role**: `admin` on the ShoutOut client (`auth.clientId`,
  default `shoutout-web`). Change the role name with `auth.adminRole`, or read it
  from another client with `auth.rolesClientId`.
- Role changes apply at the next sign-in.

Setting it up in your own Keycloak:

1. Clients → _shoutout-web_ → **Roles** → create `admin`.
2. Give it to your admins: Users → _user_ → **Role mapping** → assign the client
   role, or assign it to a group (e.g. one mapped from an AD group).
3. Keep the default **roles** client scope on the client. It puts
   `resource_access.<client>.roles` in the access token, which is where ShoutOut
   looks (it also reads the ID token if you add a client-role mapper there).
4. Keep the **email** client scope: ShoutOut needs every user's email address.

## Admin

Admins get an **Admin** area:

- **Moderation** – reported shoutouts are hidden straight away; restore or remove them.
- **Cards** – create cards from the built-in illustrations and colours, edit, reorder, retire.
- **Values** – add, rename, reorder and retire company values.
- **Export** – CSV downloads of shoutouts, a per-person summary and leaderboards.
- **Audit log** – who reported, moderated, changed or exported what.

## Configuration

| Env var                                    | Helm value                               | Default          | Meaning                                                                                  |
| ------------------------------------------ | ---------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| `SHOUTOUT_QUARTERLY_BUDGET`                | `config.quarterlyBudget`                 | `20`             | Shoutouts per person per calendar quarter (each recipient uses one)                      |
| `SHOUTOUT_MAX_RECIPIENTS`                  | `config.maxRecipients`                   | `5`              | Most people in one shoutout                                                              |
| `SHOUTOUT_SYNC_ON_STARTUP`                 | `userSync.onStartup`                     | `true`           | Sync people from Keycloak when the app starts                                            |
| –                                          | `userSync.schedule`                      | `0 * * * *`      | CronJob schedule for the Keycloak people sync                                            |
| `SHOUTOUT_SYNC_TOKEN`                      | `secrets.syncToken`                      | generated        | Bearer token for `POST /api/internal/sync-users`                                         |
| `AUTH_KEYCLOAK_ISSUER` / `_ID` / `_SECRET` | `auth.*`, `secrets.keycloakClientSecret` | bundled Keycloak | OIDC client; its service account needs realm-management `view-users` for the people sync |
| `SHOUTOUT_ADMIN_ROLE`                      | `auth.adminRole`                         | `admin`          | Client role that grants admin                                                            |
| `SHOUTOUT_ROLES_CLIENT_ID`                 | `auth.rolesClientId`                     | `auth.clientId`  | Client whose roles are checked                                                           |
| `LOG_LEVEL` / `LOG_FORMAT`                 | `logging.level` / `logging.format`       | `info` / `json`  | Log threshold (`debug` adds Auth.js OIDC traffic, secrets redacted); `text` for humans   |
| `NODE_EXTRA_CA_CERTS`                      | `app.extraCaCerts`                       | –                | Extra trusted CAs (ConfigMap or Secret with a PEM bundle), e.g. a company CA             |

Example: `helm upgrade shoutout deploy/helm/shoutout --reuse-values --set config.quarterlyBudget=30`

## Troubleshooting sign-in

The app logs JSON lines with a `scope` (`auth`, `user-sync`, `request`). Start with:

```bash
kubectl -n shoutout logs deploy/shoutout-app | grep '"scope":"auth"'
```

- **At startup** it logs its auth settings (never secret values) and checks
  Keycloak's discovery URL. Look for `Keycloak discovery OK`, or an error naming
  the problem: an untrusted certificate (`errorCode` like
  `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`), an unresolvable host, or Keycloak
  reporting a different issuer than `AUTH_KEYCLOAK_ISSUER`.
- **Each sign-in** logs `Signed in` with the user, whether they are an admin and
  which client roles were found, or `Sign-in failed while saving the user` with
  the claims Keycloak sent (e.g. no `email`).
- **Auth.js errors** are logged with their full cause chain. Set
  `logging.level=debug` to also see the OIDC requests and responses.
- A failed sign-in lands on the sign-in page with a short message; the details
  are only in the log.

Company CA: `kubectl -n shoutout create configmap corp-ca --from-file=ca.crt=corp-ca.pem`,
then `--set app.extraCaCerts.configMap=corp-ca`.

## Helm chart

`deploy/helm/shoutout` deploys the app with an init container that runs
database migrations, plus optional bundled PostgreSQL and Keycloak. For real
environments, disable the bundled services and point at managed ones:

```yaml
appUrl: https://shoutout.example.com
postgres: { enabled: false }
keycloak: { enabled: false }
database: { existingSecret: shoutout-db, existingSecretKey: database-url }
auth: { issuer: https://sso.example.com/realms/example, clientId: shoutout-web }
secrets: { existingSecret: shoutout-secrets } # auth-secret, keycloak-client-secret
app:
  image: { tag: "1.0.0" }
  ingress: { className: nginx, host: shoutout.example.com, tls: [...] }
```

### Installing the published chart

CI publishes the chart as an OCI artifact after the image for the same commit:

```bash
helm install shoutout oci://ghcr.io/opentooling/charts/shoutout -f my-values.yaml
helm show values oci://ghcr.io/opentooling/charts/shoutout      # all settings
```

`deploy/examples/values-production.yaml` is a commented starting point for a
real cluster: external PostgreSQL and Keycloak, ingress with TLS, replicas, and
the OpenShift and `extraObjects` settings ready to uncomment.

Chart versions are `<major.minor from Chart.yaml>.<CI run number>`, so a plain
install gets the newest. Each chart's `appVersion` (the default image tag) is
the `sha-<commit>` image built from the same commit. Pin with `--version`.

### OpenShift

Set `openshift.enabled: true` to run under the `restricted-v2` SCC. Pods then
omit fixed `runAsUser`/`runAsGroup`/`fsGroup` so OpenShift assigns them from the
namespace range; every container already runs non-root with all capabilities
dropped, no privilege escalation and the `RuntimeDefault` seccomp profile, and
all images work with an arbitrary UID. Ingresses are turned into Routes by
OpenShift; to control Routes directly, disable the ingresses and add Routes via
`extraObjects`.

### Extra objects

`extraObjects` deploys additional manifests with the release, such as custom
resources your platform needs (their CRDs must already be installed). Items may
be YAML objects or strings, and are rendered with `tpl`:

```yaml
extraObjects:
  - apiVersion: route.openshift.io/v1
    kind: Route
    metadata:
      name: '{{ include "shoutout.fullname" $ }}-app'
    spec:
      host: shoutout.apps.example.com
      to: { kind: Service, name: '{{ include "shoutout.fullname" $ }}-app' }
      port: { targetPort: http }
      tls: { termination: edge }
```

## Container image

CI publishes a multi-arch (amd64 + arm64) image to
`ghcr.io/opentooling/shoutout` for every commit on `main` that passes tests,
Helm lint, `npm audit` and the Trivy scan. Tags: `sha-<short commit>`,
`sha-<full commit>`, `main` and `latest`.

Publishing to the `opentooling` org needs credentials that can write there:
either host the repository in that org, or add a `GHCR_TOKEN` repository
secret (a classic PAT with `write:packages` from an org member) and a
`GHCR_USERNAME` variable. Without them CI still builds and scans, and skips
publishing with a notice.

To run the published image in the local k3d cluster instead of building:

```bash
GHCR_TAG=main deploy/local/deploy.sh      # or latest, sha-<commit>
```

The package must be public (or the cluster given a pull secret).

## License

MIT
