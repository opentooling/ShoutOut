import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { updateShoutoutAction } from "@/app/actions/shoutouts";
import { toCardDesign } from "@/components/cards/designs";
import { AppHeader } from "@/components/layout/app-header";
import { EditShoutoutForm } from "@/components/shoutouts/edit-form";
import { loadConfig, MESSAGE_MAX_LENGTH } from "@/lib/config";
import { getDb } from "@/lib/db";
import { listActiveCards, listActiveValues } from "@/server/shoutouts/catalog";
import { getVisibleShoutout } from "@/server/shoutouts/feed";

export const metadata: Metadata = { title: "Edit shoutout" };

export default async function EditShoutoutPage({ params }: PageProps<"/shoutouts/[id]/edit">) {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }
  const { user } = session;
  const { id } = await params;
  const db = getDb();
  const shoutout = await getVisibleShoutout(db, user.id, id);
  if (!shoutout?.canModify) {
    notFound();
  }
  const [cards, values] = await Promise.all([listActiveCards(db), listActiveValues(db)]);
  // Keep a retired card/value selectable if this shoutout already uses it.
  const cardOptions = cards.some((c) => c.id === shoutout.card.id)
    ? cards
    : [shoutout.card, ...cards];
  const retired = shoutout.values.filter((kept) => !values.some((v) => v.id === kept.id));
  const valueOptions = [...retired, ...values];

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <h1 className="font-display text-3xl font-semibold">Edit shoutout</h1>
        <p className="mt-1 text-muted">
          To {shoutout.recipients.map((r) => r.name).join(", ")}. You can edit for 24 hours after
          sending.
        </p>
        <div className="mt-6">
          <EditShoutoutForm
            action={updateShoutoutAction.bind(null, shoutout.id)}
            cards={cardOptions.map((card) => ({ id: card.id, design: toCardDesign(card) }))}
            values={valueOptions}
            initial={{
              cardId: shoutout.card.id,
              valueIds: shoutout.values.map((value) => value.id),
              message: shoutout.message,
              visibility: shoutout.visibility,
            }}
            maxMessageLength={MESSAGE_MAX_LENGTH}
            maxValues={loadConfig().maxValues}
          />
        </div>
      </main>
    </>
  );
}
