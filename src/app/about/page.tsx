import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { SiteHeader } from "@/components/layout/site-header";
import { buttonClasses } from "@/components/ui/button";
import { loadConfig, MESSAGE_MAX_LENGTH } from "@/lib/config";
import { getDb } from "@/lib/db";
import { listActiveValues } from "@/server/shoutouts/catalog";

export const metadata: Metadata = {
  title: "About",
  description: "Why ShoutOut exists and how to make the most of it.",
};

function Section({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border-2 border-border bg-surface p-6 shadow-card sm:p-8">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      {lead && <p className="mt-2 text-lg text-muted">{lead}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/** A pair of example messages: what works, and what says very little. */
function Examples({ good, weak }: { good: string; weak: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl bg-leaf-soft p-4">
        <p className="text-sm font-bold text-leaf-strong">Says something</p>
        <p className="mt-1">“{good}”</p>
      </div>
      <div className="rounded-2xl bg-surface-muted p-4">
        <p className="text-sm font-bold text-muted">Says very little</p>
        <p className="mt-1">“{weak}”</p>
      </div>
    </div>
  );
}

export default async function AboutPage() {
  const session = await auth();
  const { quarterlyBudget, maxRecipients } = loadConfig();
  const values = await listActiveValues(getDb());

  return (
    <>
      <SiteHeader user={session?.user} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        <div className="text-center">
          <h1 className="font-display text-4xl font-semibold">Why ShoutOut?</h1>
          <p className="mx-auto mt-3 max-w-xl text-lg text-muted">
            Good work happens all day long and most of it goes unsaid. ShoutOut is a place to say it
            out loud, so the people who make your work easier hear it, and so does everyone else.
          </p>
          <p className="mt-2 text-sm text-muted">
            Looking for how-to steps?{" "}
            <Link href="/guide" className="font-bold text-teal-strong hover:underline">
              Read the user guide
            </Link>
            .
          </p>
        </div>

        <Section
          title="Recognition people can see"
          lead="A quiet thank-you helps one person. A public one teaches everybody."
        >
          <p>
            Most gratitude at work disappears into a private message or a passing corridor
            conversation. Writing it here gives it a longer life: your colleague can look back at
            it, their manager sees it at review time, and everyone else picks up on what good work
            looks like around here.
          </p>
          <p>
            You can send a shoutout privately if you think someone would rather not be in the
            spotlight. Most of the time, though, public is the kinder choice.
          </p>
        </Section>

        <Section
          title="Look beyond your own team"
          lead="The people who help you most are often the ones you never sit next to."
        >
          <p>
            It is easy to recognise the person you speak to every morning. Think instead about who
            unblocked you last month: the engineer in another team who answered your question, the
            person who quietly fixed the thing nobody wanted to own, the colleague who sat with a
            new starter on their first day.
          </p>
          <p>
            Try to spread your shoutouts around, too. Sending them to the same person every time
            says more about your habits than their work. If you have recognised someone recently,
            take a moment to ask who else deserves it. You can thank up to {maxRecipients} people in
            one shoutout when a group made it happen, and it costs you one shoutout per person, so
            that is a real choice.
          </p>
          <p>
            You cannot recognise yourself. That one is deliberate: this is about noticing other
            people.
          </p>
        </Section>

        <Section
          title="The values we are celebrating"
          lead="Every shoutout names one, so recognition connects to what we care about."
        >
          <ul className="flex flex-wrap gap-2">
            {values.map((value) => (
              <li
                key={value.id}
                className="rounded-full bg-sunny-soft px-3 py-1 font-bold dark:text-sunny"
              >
                {value.name}
              </li>
            ))}
          </ul>
          <p>
            Choosing a value takes a second and changes what you write. It pushes you past “thanks
            for your help” towards what the person actually did and why it mattered. Over time the
            mix shows which of our values we live out loud, and which ones we only have on a wall.
          </p>
        </Section>

        <Section
          title={`Why you only get ${quarterlyBudget} a quarter`}
          lead="Something given out endlessly stops meaning anything."
        >
          <p>
            Everyone gets {quarterlyBudget} shoutouts per quarter, and each person you name uses
            one. The limit is not there to ration kindness. It is there so that a shoutout stays
            worth receiving: if you have a budget, you spend it on the moments that genuinely stood
            out.
          </p>
          <p>
            The count resets at the start of every quarter, so there is nothing to save up and
            nothing to lose. If you find yourself with a full balance in the last week of the
            quarter, that is worth noticing: someone around you has probably earned one.
          </p>
        </Section>

        <Section
          title="Keep it short and specific"
          lead={`Up to ${MESSAGE_MAX_LENGTH} characters, which is plenty for the thing that mattered.`}
        >
          <p>
            The best shoutouts name what someone did and what it changed. Skip the preamble and the
            job titles, and write it the way you would say it to their face.
          </p>
          <Examples
            good="Rewrote the onboarding docs before the new starters arrived. Three of them got set up without asking anyone for help."
            weak="Thanks for everything you do, you are a real asset to the team!"
          />
          <p>
            The short limit is the point. It keeps the message readable at a glance and stops
            recognition from turning into a performance review.
          </p>
        </Section>

        <Section title="A few practical things">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              You can edit or delete a shoutout for 24 hours after sending it. Deleting it gives you
              the budget back.
            </li>
            <li>
              Anyone who can see a shoutout can react to it or add a comment. Joining in costs you
              nothing from your own budget.
            </li>
            <li>
              Leaderboards count every shoutout, including private ones, and show numbers only. They
              are there to spot who we might be overlooking, not to start a competition.
            </li>
            <li>
              If something is unkind or inappropriate, report it. It is hidden straight away and an
              admin takes a look.
            </li>
          </ul>
        </Section>

        <div className="pb-4 text-center">
          <Link
            href={session?.user ? "/shoutouts/new" : "/signin"}
            className={buttonClasses({ size: "lg" })}
          >
            {session?.user ? "Send a shoutout" : "Sign in to get started"}
          </Link>
        </div>
      </main>
    </>
  );
}
