// Generates SQL for ~6 months of demo shoutouts between the demo users.
// Usage: deploy/local/seed-demo.sh [--remove]
const people = ["alice", "bob", "carol", "dave", "erin", "frank", "grace", "henry"];
const cards = [
  "thank-you",
  "above-and-beyond",
  "team-player",
  "innovator",
  "welcome-aboard",
  "congrats",
  "customer-hero",
  "problem-solver",
  "mentor",
  "crushed-it",
];
const values = ["integrity", "diversity", "excellence", "collaboration", "engagement"];
const messages = [
  "Thanks for jumping in to help with the release, it made all the difference.",
  "Your write-up of the incident was so clear, the whole team learned from it.",
  "Loved how you ran the retro, everyone felt heard.",
  "You unblocked three teams this week. Legend!",
  "Thank you for mentoring our new starters so patiently.",
  "That customer demo was brilliant, they signed the next day.",
  "Great idea to automate the report, it saves us hours every week.",
  "Welcome to the team! Already making an impact.",
  "Thanks for staying calm and kind during a stressful launch.",
  "Your accessibility review caught issues nobody else spotted.",
  "Amazing job organising the team offsite.",
  "Thank you for always making time to answer questions.",
];
const comments = [
  "Couldn't agree more!",
  "So well deserved.",
  "Seconded, this saved us a lot of time.",
  "This is exactly what the team needed. Thank you!",
  "Great to see this recognised.",
];
const reactions = [
  "clap",
  "heart",
  "party",
  "fire",
  "raised-hands",
  "rocket",
  "hundred",
  "star-struck",
];

let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (list) => list[Math.floor(rand() * list.length)];
const q = (s) => `'${s.replace(/'/g, "''")}'`;
const user = (name) => `(SELECT id FROM users WHERE email = '${name}@shoutout.local')`;

const now = Date.now();
const DAY = 86_400_000;
const quarterStart = (() => {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1);
})();
// Keep demo data well inside each person's budget for the current quarter.
const usedThisQuarter = Object.fromEntries(people.map((p) => [p, 0]));
const pointsThisQuarter = Object.fromEntries(people.map((p) => [p, 0]));

const sql = ["BEGIN;"];
const COUNT = 140;
for (let i = 0; i < COUNT; i++) {
  const sender = pick(people);
  // Skew recipients so leaderboards are interesting.
  const weighted = [...people, "carol", "carol", "erin", "bob", "henry"].filter(
    (p) => p !== sender,
  );
  const recipientCount = rand() < 0.8 ? 1 : 2;
  const recipients = [...new Set(Array.from({ length: recipientCount }, () => pick(weighted)))];
  const at = now - Math.floor(rand() ** 1.3 * 180 * DAY) - 3_600_000;
  if (at >= quarterStart) {
    if (usedThisQuarter[sender] + recipients.length > 6) continue;
    usedThisQuarter[sender] += recipients.length;
  }
  const id = `demo_${i}`;
  const createdAt = new Date(at).toISOString();
  const visibility = rand() < 0.15 ? "PRIVATE" : "PUBLIC";
  // About a third include points (used when points mode is on), keeping most of
  // this quarter's points budget free for trying it out.
  let points = rand() < 0.35 ? pick([5, 5, 10, 10, 25]) : 0;
  if (at >= quarterStart && pointsThisQuarter[sender] + points * recipients.length > 40) points = 0;
  if (at >= quarterStart) pointsThisQuarter[sender] += points * recipients.length;
  sql.push(
    `INSERT INTO shoutouts (id, sender_id, card_id, value_id, message, visibility, points, created_at, updated_at) VALUES (` +
      `${q(id)}, ${user(sender)}, 'card_${pick(cards)}', 'value_${pick(values)}', ${q(`${pick(messages)} [demo]`)}, ` +
      `'${visibility}', ${points}, ${q(createdAt)}, ${q(createdAt)});`,
  );
  for (const r of recipients) {
    sql.push(
      `INSERT INTO shoutout_recipients (shoutout_id, user_id) VALUES (${q(id)}, ${user(r)});`,
    );
  }
  for (const reactor of people.filter(() => rand() < 0.25)) {
    sql.push(
      `INSERT INTO reactions (shoutout_id, user_id, emoji, created_at) VALUES (${q(id)}, ${user(reactor)}, ${q(pick(reactions))}, ${q(createdAt)}) ON CONFLICT DO NOTHING;`,
    );
  }
}
// A few conversations, added after the shoutouts so the rest of the data stays the same.
for (let i = 0; i < COUNT; i++) {
  if (rand() >= 0.2) continue;
  const commenters = people.filter(() => rand() < 0.2).slice(0, 2);
  commenters.forEach((author, n) => {
    const id = `demo_${i}`;
    const at = `(SELECT created_at + interval '${n + 1} hours' FROM shoutouts WHERE id = ${q(id)})`;
    sql.push(
      `INSERT INTO comments (id, shoutout_id, author_id, body, created_at, updated_at) ` +
        `SELECT ${q(`${id}_c${n}`)}, ${q(id)}, ${user(author)}, ${q(pick(comments))}, ${at}, ${at} ` +
        `WHERE EXISTS (SELECT 1 FROM shoutouts WHERE id = ${q(id)});`,
    );
  });
}
sql.push("COMMIT;");
process.stdout.write(sql.join("\n") + "\n");
