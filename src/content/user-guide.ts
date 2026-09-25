/**
 * The ShoutOut user guide. This one source feeds the in-app page (/guide) and
 * docs/USER-GUIDE.md (`npm run guide:docs`). Screenshots are captured from a
 * running deployment with demo data by `npm run guide:screenshots` into
 * public/guide/.
 *
 * Keep this module free of path aliases and JSON imports so the docs script
 * can load it with plain Node.
 */

export interface GuideScreenshot {
  /** File name in public/guide/. */
  file: string;
  alt: string;
}

export interface GuideSection {
  id: string;
  title: string;
  audience: "everyone" | "admins";
  intro: string;
  steps?: string[];
  tips?: string[];
  screenshot: GuideScreenshot;
}

export const GUIDE_TITLE = "ShoutOut user guide";
export const GUIDE_INTRO =
  "Everything you need to recognise colleagues with ShoutOut: signing in, sending shoutouts, joining in, and finding recognition. The last part covers the admin tools.";

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "signing-in",
    title: "Signing in",
    audience: "everyone",
    intro:
      "ShoutOut uses your normal work account, so there is nothing new to remember. Everyone who can sign in can send and receive shoutouts.",
    steps: [
      "Open ShoutOut and choose **Sign in with your work account**.",
      "Sign in on your company's login page.",
      "You arrive on the feed. Choose **Sign out** at the top right when you're done; it signs you out of your work account too.",
    ],
    screenshot: {
      file: "signin.jpg",
      alt: "The ShoutOut sign-in page with the Sign in with your work account button",
    },
  },
  {
    id: "the-feed",
    title: "The feed",
    audience: "everyone",
    intro:
      "The feed is your home page. It shows the latest shoutouts you can see, newest first, with your remaining budget and this month's most recognised colleagues alongside.",
    tips: [
      "Each shoutout shows who it is for, who sent it, the card, the company value it celebrates and the message.",
      "Choose **Show older shoutouts** at the bottom to go further back.",
      "Choose a person's name to open their profile.",
    ],
    screenshot: {
      file: "feed.jpg",
      alt: "The feed with shoutout cards on the left and the greeting, budget and Top this month board on the right",
    },
  },
  {
    id: "sending-a-shoutout",
    title: "Sending a shoutout",
    audience: "everyone",
    intro:
      "A shoutout is a short, specific thank-you on a card, tied to one of our company values.",
    steps: [
      "Choose **Send a shoutout** on the feed.",
      "Under **Who are you recognising?**, start typing a name and pick the person. Add more people if a group made it happen (up to five).",
      "Pick a **card** that fits the moment.",
      "Pick the **company value** they showed.",
      "Under **Say thanks**, write what they did and what it changed, in up to 280 characters. The preview on the right shows how it will look.",
      "Choose who can see it: **Public** (everyone) or **Private** (only you and the people you're thanking).",
      "Choose **Send shoutout**. It appears in the feed straight away.",
    ],
    tips: [
      "You can't send a shoutout to yourself.",
      "Specific beats general: “Rewrote the onboarding docs before the new starters arrived” says more than “Thanks for everything”.",
    ],
    screenshot: {
      file: "send.jpg",
      alt: "The Send a shoutout form with a recipient, card, value and message filled in, and a live preview",
    },
  },
  {
    id: "your-budget",
    title: "Your quarterly budget",
    audience: "everyone",
    intro:
      "Everyone gets a set number of shoutouts each calendar quarter (20 unless your company changed it). Each person you thank uses one, so a shoutout to three people uses three.",
    tips: [
      "The meter on the feed shows what you have left and when it resets.",
      "The budget resets on the first day of each quarter; unused shoutouts don't carry over.",
      "Deleting a shoutout within 24 hours gives the budget back.",
    ],
    screenshot: {
      file: "budget.jpg",
      alt: "The greeting card with the Send a shoutout button, the shoutouts left this quarter and the reset date",
    },
  },
  {
    id: "reactions-and-comments",
    title: "Reactions and comments",
    audience: "everyone",
    intro: "Join in on any shoutout you can see. Reactions and comments don't use your budget.",
    steps: [
      "Choose an emoji under a shoutout to react. Choose it again to take your reaction back.",
      "Choose **☺ +** to pick a different emoji.",
      "Choose **Comment** (or the comment count) to open the shoutout and add a comment.",
    ],
    screenshot: {
      file: "detail.jpg",
      alt: "A shoutout page with emoji reactions and a comment thread",
    },
  },
  {
    id: "editing-and-deleting",
    title: "Editing or deleting your shoutout",
    audience: "everyone",
    intro:
      "Made a typo or picked the wrong card? You can change or remove your own shoutout for 24 hours after sending it.",
    steps: [
      "Find the shoutout in the feed.",
      "Choose **Edit** to change the card, value, message or visibility. The recipients can't be changed; delete it and send a new one instead.",
      "Choose **Delete** to remove it. The shoutouts it used go back into your budget.",
    ],
    tips: ["After 24 hours the Edit and Delete buttons disappear."],
    screenshot: {
      file: "edit-delete.jpg",
      alt: "Your own recent shoutout showing the Edit and Delete buttons",
    },
  },
  {
    id: "search-and-filter",
    title: "Searching and filtering the feed",
    audience: "everyone",
    intro: "Looking for a particular shoutout? Narrow the feed down.",
    steps: [
      "Open **Search & filter** above the feed.",
      "Search the message text, pick a person (sent or received), a value, a card, or a date range.",
      "Choose **Apply filters**. Choose **Clear** to see everything again.",
    ],
    screenshot: {
      file: "filters.jpg",
      alt: "The Search and filter panel open with fields for text, person, value, card and dates",
    },
  },
  {
    id: "people-and-profiles",
    title: "People and profiles",
    audience: "everyone",
    intro: "Find anyone in the company and see the recognition they've received and given.",
    steps: [
      "Choose **People** in the top menu and start typing a name or email; results update as you type.",
      "Choose a person to open their profile: shoutouts they've received and sent, and the values they're most recognised for.",
      "Choose **Recognise** followed by their name to start a shoutout.",
    ],
    tips: [
      "Other people see only public shoutouts on a profile. On your own profile you also see private ones you sent or received.",
      "On a phone, the light and dark mode switch is on your own profile page.",
    ],
    screenshot: {
      file: "profile.jpg",
      alt: "A person's profile showing their top values and recent shoutouts",
    },
  },
  {
    id: "leaderboard",
    title: "The leaderboard",
    audience: "everyone",
    intro:
      "See who has been recognised most, who recognises others most, and which values show up most, for this week, month, quarter or all time.",
    tips: [
      "Your own row is highlighted, even if you're outside the top ten.",
      "Private shoutouts count too, but only as numbers.",
      "It's a way to spot who might be overlooked, not a competition.",
    ],
    screenshot: {
      file: "leaderboard.jpg",
      alt: "The leaderboard with Most recognised, Top recognisers and Top values",
    },
  },
  {
    id: "reporting",
    title: "Reporting a shoutout",
    audience: "everyone",
    intro:
      "If a shoutout is unkind, inappropriate or spam, report it. It is hidden from everyone straight away until an admin reviews it.",
    steps: [
      "Choose **Report** on the shoutout.",
      "Pick a reason and, if you like, add a note for the admins.",
      "Choose **Report shoutout**.",
    ],
    screenshot: {
      file: "report.jpg",
      alt: "The report form with reasons and an optional note",
    },
  },
  {
    id: "light-and-dark",
    title: "Light and dark mode",
    audience: "everyone",
    intro:
      "Use the switch at the top right to choose light, dark, or match your device. On a phone it's on your profile page. ShoutOut remembers your choice.",
    screenshot: {
      file: "dark.jpg",
      alt: "The feed in dark mode",
    },
  },
  {
    id: "email-notifications",
    title: "Email notifications",
    audience: "everyone",
    intro:
      "If your company has turned email on, ShoutOut emails you when someone sends you a shoutout. Once a quarter, about two weeks before the budget resets, it also reminds you if you still have shoutouts left. Both are on unless you turn them off.",
    steps: [
      "Choose your name or picture at the top right to open **your profile**.",
      "Under **Email me**, untick the emails you don't want.",
      "Choose **Save email settings**.",
    ],
    tips: [
      "Every email has a link straight to these settings.",
      "An email about a new shoutout arrives a couple of minutes after it's sent, so a quick edit by the sender is included.",
    ],
    screenshot: {
      file: "email-settings.jpg",
      alt: "Your profile with the Email me settings: emails about shoutouts you receive and the budget reminder",
    },
  },
  {
    id: "admin-moderation",
    title: "Moderation",
    audience: "admins",
    intro:
      "Admins see **Admin** in the top menu. The first tab lists reported shoutouts, which are already hidden from everyone.",
    steps: [
      "Read the shoutout, the reason and any notes. Private messages are shown here so you can judge them.",
      "Choose **Restore** if it's fine: it reappears where it was.",
      "Choose **Remove** if it breaks the rules: it stays hidden for good.",
    ],
    tips: [
      "A shoutout that was restored and is reported again is removed automatically.",
      "Every decision is recorded in the **Audit log**.",
    ],
    screenshot: {
      file: "admin-moderation.jpg",
      alt: "The admin moderation tab listing reported shoutouts with Restore and Remove",
    },
  },
  {
    id: "admin-cards-and-values",
    title: "Cards and values",
    audience: "admins",
    intro: "Keep the card designs and company values current.",
    steps: [
      "**Cards**: create a card from the built-in illustrations and colours, edit its title and tagline, move it up or down, or retire it.",
      "**Values**: add, rename, reorder or retire a company value.",
    ],
    tips: [
      "Retired cards and values stay on old shoutouts; they just can't be picked for new ones.",
      "At least one card and one value must stay active.",
    ],
    screenshot: {
      file: "admin-cards.jpg",
      alt: "The admin cards list with preview, usage count and reorder, edit and retire buttons",
    },
  },
  {
    id: "admin-export",
    title: "Exports and the audit log",
    audience: "admins",
    intro:
      "Download CSV files of all shoutouts, a per-person summary, or the leaderboards for any period. The **Audit log** shows who reported, moderated, changed or exported what, and when.",
    tips: ["Private messages are shown as [private] in the shoutouts export."],
    screenshot: {
      file: "admin-export.jpg",
      alt: "The admin export tab with download buttons for shoutouts, people and leaderboards",
    },
  },
  {
    id: "analytics",
    title: "Analytics",
    audience: "admins",
    intro:
      "**Analytics** shows how recognition is going: totals and trends, participation, which values and cards are used, and who hasn't been recognised recently. Your company can choose to let everyone see it; the “not recognised recently” list is always admin-only.",
    screenshot: {
      file: "analytics.jpg",
      alt: "The analytics dashboard with summary tiles, a trend chart and value breakdown",
    },
  },
];

function markdownSection(section: GuideSection, imageBase: string): string {
  const parts = [`### ${section.title}`, section.intro];
  if (section.steps?.length) {
    parts.push(section.steps.map((step, i) => `${i + 1}. ${step}`).join("\n"));
  }
  if (section.tips?.length) {
    parts.push(section.tips.map((tip) => `- ${tip}`).join("\n"));
  }
  parts.push(`![${section.screenshot.alt}](${imageBase}/${section.screenshot.file})`);
  return parts.join("\n\n");
}

/** The guide as Markdown, with images under `imageBase` (e.g. "../public/guide"). */
export function guideToMarkdown(imageBase: string): string {
  const header = [
    `# ${GUIDE_TITLE}`,
    "<!-- Generated from src/content/user-guide.ts by `npm run guide:docs`. Edit that file, not this one. -->",
    GUIDE_INTRO,
    "Also available in the app at **/guide**.",
  ];
  const toc = GUIDE_SECTIONS.map(
    (s) => `- [${s.title}](#${s.id})${s.audience === "admins" ? " (admins)" : ""}`,
  ).join("\n");
  const group = (audience: GuideSection["audience"]) =>
    GUIDE_SECTIONS.filter((s) => s.audience === audience).map(
      (s) =>
        // An explicit anchor keeps the table-of-contents links stable.
        `<a id="${s.id}"></a>\n\n${markdownSection(s, imageBase)}`,
    );
  return (
    [
      ...header,
      "## Contents",
      toc,
      "## Using ShoutOut",
      ...group("everyone"),
      "## For admins",
      ...group("admins"),
    ].join("\n\n") + "\n"
  );
}
