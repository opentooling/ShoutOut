import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sendShoutoutAction } from "@/app/actions/shoutouts";
import { toCardDesign } from "@/components/cards/designs";
import { AppHeader } from "@/components/layout/app-header";
import { SendShoutoutForm } from "@/components/shoutouts/send-form";
import { buttonClasses } from "@/components/ui/button";
import { loadConfig, MESSAGE_MAX_LENGTH } from "@/lib/config";
import { getDb } from "@/lib/db";
import { getBudget, getPointsBudget } from "@/server/shoutouts/budget";
import { listActiveCards, listActiveValues } from "@/server/shoutouts/catalog";

export const metadata: Metadata = { title: "Send a shoutout" };

export default async function NewShoutoutPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }
  const { user } = session;
  const db = getDb();
  const config = loadConfig();
  const [budget, pointsBudget, cards, values] = await Promise.all([
    config.budgetEnabled ? getBudget(db, user.id, config.quarterlyBudget) : null,
    config.points.enabled ? getPointsBudget(db, user.id, config.points.quarterlyBudget) : null,
    listActiveCards(db),
    listActiveValues(db),
  ]);

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">Send a shoutout</h1>
        {budget?.remaining === 0 ? (
          <div className="mt-6 space-y-4 rounded-[var(--radius-card)] border-2 border-border bg-surface p-8">
            <p className="text-lg">
              You&apos;ve used all {budget.allowance} shoutouts for this quarter. Your budget resets
              soon!
            </p>
            <Link href="/" className={buttonClasses({ variant: "outline" })}>
              Back to the feed
            </Link>
          </div>
        ) : (
          <div className="mt-6">
            <SendShoutoutForm
              action={sendShoutoutAction}
              cards={cards.map((card) => ({ id: card.id, design: toCardDesign(card) }))}
              values={values}
              senderName={user.name ?? user.email ?? "You"}
              remaining={budget?.remaining ?? null}
              points={
                pointsBudget && {
                  remaining: pointsBudget.remaining,
                  choices: config.points.choices,
                }
              }
              maxRecipients={config.maxRecipients}
              maxMessageLength={MESSAGE_MAX_LENGTH}
            />
          </div>
        )}
      </main>
    </>
  );
}
