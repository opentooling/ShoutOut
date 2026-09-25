# Email notifications

ShoutOut can email people through your company's SMTP relay:

- **When someone sends them a shoutout.** The email has the card, the value and
  the message, and links to the shoutout. It goes out a couple of minutes after
  sending (`delaySeconds`), so a quick edit is included and a shoutout deleted
  straight away is never announced.
- **Before their unused shoutouts expire.** One reminder per quarter,
  `reminderDaysBeforeReset` days before the budget resets (default 14, sent at
  08:00 UTC), to everyone who still has shoutouts left. It encourages people to
  recognise someone outside their own team.

Both are **on for everyone by default**. Each person can turn either off on
their own profile page (**Email me**); every email links there.

Email is off until you set it up. Nothing is queued while it is off.

## 1. Get access to the relay

Ask your mail team for:

- The relay's **host name and port**. Internal relays usually listen on port 25
  and accept mail from allowed networks without a sign-in.
- Permission for the **cluster's outgoing IP addresses** to relay mail. Pods
  usually leave through the nodes' IPs or a NAT gateway.
- Permission to send as the **sender address**, e.g. `shoutout@example.com`. A
  real mailbox or a no-reply address both work, as long as the relay accepts
  it and SPF/DKIM for the domain cover the relay.
- Whether the relay uses **TLS**, and whether its certificate comes from a
  company certificate authority.
- A **username and password** only if the relay needs a sign-in.

## 2. Configure the chart

```yaml
notifications:
  email:
    enabled: true
    from: "ShoutOut <shoutout@example.com>"
    smtp:
      host: smtp-relay.example.com
      port: 25
      tls: auto
```

`tls` chooses how the connection is encrypted:

| `tls`      | Use it when                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------- |
| `auto`     | Default. TLS from the start on port 465; otherwise STARTTLS when the relay offers it          |
| `starttls` | The relay must use STARTTLS; fail rather than send in the clear                               |
| `tls`      | The relay expects TLS from the first byte (implicit TLS), usually on port 465                 |
| `none`     | Plain SMTP. Only for an internal relay whose certificate can't be verified and can't be fixed |

If the relay's certificate comes from a company CA, trust it rather than
turning TLS off:

```yaml
app:
  extraCaCerts:
    configMap: corp-ca # kubectl create configmap corp-ca --from-file=ca.crt=corp-ca.pem
```

### Relays that need a sign-in

Set the username and put the password in the secret as `smtp-password`:

```yaml
notifications:
  email:
    smtp:
      port: 587
      tls: starttls
      username: svc-shoutout
```

```bash
kubectl -n shoutout patch secret shoutout-secrets --type merge \
  -p "{\"stringData\":{\"smtp-password\":\"$SMTP_PASSWORD\"}}"
```

With `secrets.existingSecret`, add the `smtp-password` key to that secret. Restart
the app after changing it: `kubectl -n shoutout rollout restart deploy/shoutout-app`.

### Other settings

| Helm value                                    | Env var                         | Default | Meaning                                                       |
| --------------------------------------------- | ------------------------------- | ------- | ------------------------------------------------------------- |
| `notifications.email.smtp.ehloName`           | `SMTP_EHLO_NAME`                | –       | Host name to greet the relay with, if it rejects the pod name |
| `notifications.email.delaySeconds`            | `SHOUTOUT_EMAIL_DELAY_SECONDS`  | `120`   | Wait before emailing about a new shoutout                     |
| `notifications.email.reminderDaysBeforeReset` | `SHOUTOUT_BUDGET_REMINDER_DAYS` | `14`    | When to send the budget reminder; `0` turns reminders off     |

Links in emails use `appUrl`.

## 3. Check it

When the app starts it logs its email settings and tries the relay:

```bash
kubectl -n shoutout logs deploy/shoutout-app | grep '"scope":"notifications"'
```

- `Email notifications are on` lists the settings (never the password).
- `SMTP server accepted the connection` means the relay is reachable and
  accepted the sign-in, if any.
- `Could not connect to the SMTP server…` includes the error and a `hint` with
  the likely fix. Emails wait in the queue and are retried.

Then send a shoutout to a colleague (or ask one to send you one) and look for
`Email sent` a couple of minutes later.

## How sending works

Notifications are written to a queue table (`notification_outbox`) in the same
transaction as the shoutout. A background sender in the app works through it
every 30 seconds:

- Several app replicas can run at once; each notification is sent once.
- If the relay is down, each email is retried with growing gaps (1, 2, 4 …
  minutes, then hourly) for about 3.5 hours before it is marked `FAILED`.
- When an email is due, it checks that it still applies: the shoutout still
  exists and isn't hidden by a report, the person is active and hasn't turned
  that email off, and (for reminders) they still have shoutouts left.
- Sent and skipped entries are deleted after 90 days.

To see what happened to recent notifications:

```sql
SELECT kind, status, attempts, last_error, send_after, sent_at
FROM notification_outbox ORDER BY created_at DESC LIMIT 20;
```

## Troubleshooting

| Log `hint` / error                            | Likely cause and fix                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `isn't reachable`, `ECONNECTION`, `ETIMEDOUT` | Wrong host or port, or a firewall/network policy blocks the pod. Test with the command below             |
| `doesn't resolve`, `EDNS`                     | Host name not known inside the cluster                                                                   |
| `Relay access denied`, `refused the message`  | The relay doesn't accept mail from the cluster's IPs or for that sender. Ask the mail team to allow them |
| `TLS mode mismatch`, `wrong version number`   | Port and `tls` don't match: 465 needs `tls` (or `auto`); 25 and 587 need `auto` or `starttls`            |
| `certificate isn't trusted`                   | Company CA: set `app.extraCaCerts`                                                                       |
| `rejected the sign-in`, `EAUTH`               | Wrong username or password, or the relay doesn't expect a sign-in (leave `username` empty)               |
| Relay rejects the greeting (EHLO/HELO)        | Set `smtp.ehloName` to a proper host name, e.g. the app's DNS name                                       |

Test the connection from inside the app pod (the image has no telnet or curl):

```bash
kubectl -n shoutout exec deploy/shoutout-app -- node -e '
  const s = require("net").connect(25, "smtp-relay.example.com");
  s.on("data", d => { console.log(String(d)); s.end(); });
  s.on("error", e => console.error(e.message));'
```

A `220 …` greeting means the relay is reachable.

## Trying it locally

`deploy/local/deploy.sh` runs [Mailpit](https://mailpit.axllent.org), a test
mail server, and sends every email there. Read them at http://mail.localtest.me.
Locally, the delay is 10 seconds and reminders start 60 days before the reset,
so you can see both straight away.
