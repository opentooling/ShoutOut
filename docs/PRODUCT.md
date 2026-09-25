# ShoutOut — Product scope (v1)

ShoutOut is an internal recognition platform. Employees send each other
shoutouts: a card, a company value and a message. There are no rewards or
gifts — recognition only.

## Decisions

| Area          | Decision                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity      | Keycloak (OIDC). Roles `shoutout-user`, `shoutout-admin`.                                                                                       |
| People        | All Keycloak users are synced so anyone can be recognised, even before first login. No teams.                                                   |
| Recipients    | One or more individuals per shoutout. No self-shoutouts.                                                                                        |
| Budget        | 20 per person per quarter (admin-configurable). Each recipient consumes one. Calendar quarters, no rollover.                                    |
| Editing       | Sender can edit or delete within 24h; deleting refunds the budget.                                                                              |
| Visibility    | Public by default; private = sender + recipients only. Admins see a private shoutout only if someone reports it.                                |
| Leaderboards  | Top recipients, senders and values by week/month/quarter. Count all shoutouts (private ones as numbers only). No opt-out.                       |
| Notifications | Email via the company SMTP relay: on receiving a shoutout, and a reminder before unused budget expires. On by default; each person can opt out. |
| Branding      | Warm & friendly: sunny yellow + soft teal, rounded type, illustrated cards, light and dark mode.                                                |

## Features

- **Send shoutout** — recipients, card, company value, message, public/private.
- **Cards** — 10 illustrated defaults: Thank You, Above & Beyond, Team Player / Helping Hand, Innovator / Great Idea, Welcome Aboard, Congrats, Customer Hero, Problem Solver, Mentor, Crushed It.
- **Company values** — Integrity, Diversity, Excellence, Collaboration, Engagement (admin-managed from milestone 6).
- **Feed** — company-wide feed, filters by person, value, card and date.
- **Reactions & comments** on shoutouts.
- **Profile wall** — received / sent shoutouts and top values.
- **People search** with @mentions.
- **Leaderboards** — see decisions above.
- **Admin** (`/admin`) — moderation queue, cards, values, CSV exports and audit log (see decisions above). Analytics lives at `/analytics`.

## Milestones

1. **Foundation** — Next.js app, Keycloak login, Postgres, Docker, Helm (app + Postgres + Keycloak), k3d deploy, CI, coverage gate.
2. **Branding** — design tokens, logo/favicon, 10 card illustrations, dark mode.
3. **Send & feed** — Keycloak user sync, send shoutout with budget and rules, feed.
4. **Social** — reactions, comments, profile wall, search and filters.
5. **Leaderboards & analytics**.
6. **Admin** — cards/values/budget management, moderation, CSV export.
7. **Hardening** — full E2E coverage, accessibility, polish.

## Quality bar

- ≥90% line **and** branch coverage (also statements and functions), enforced in CI.
- Integration tests against real PostgreSQL (Testcontainers).
- Playwright E2E against the deployed k3d environment.
