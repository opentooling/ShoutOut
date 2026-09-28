import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { reportShoutoutAction } from "@/app/actions/shoutouts";
import { toCardDesign } from "@/components/cards/designs";
import { ShoutoutCard } from "@/components/cards/shoutout-card";
import { AppHeader } from "@/components/layout/app-header";
import { ReportForm } from "@/components/shoutouts/report-form";
import { getDb } from "@/lib/db";
import { REPORT_REASONS } from "@/server/admin/moderation";
import { getVisibleShoutout } from "@/server/shoutouts/feed";

export const metadata: Metadata = { title: "Report shoutout" };

export default async function ReportPage({ params }: PageProps<"/shoutouts/[id]/report">) {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }
  const { user } = session;
  const { id } = await params;
  const shoutout = await getVisibleShoutout(getDb(), user.id, id);
  if (!shoutout?.canReport) {
    notFound();
  }
  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="font-display text-3xl font-semibold">Report shoutout</h1>
          <p className="mt-1 text-muted">
            It will be hidden straight away while an admin reviews it. The sender isn&apos;t told
            who reported it.
          </p>
        </div>
        <ShoutoutCard
          layout="horizontal"
          design={toCardDesign(shoutout.card)}
          from={shoutout.sender.name}
          to={shoutout.recipients.map((r) => r.name)}
          values={shoutout.values.map((value) => value.name)}
          message={shoutout.message}
        />
        <ReportForm
          action={reportShoutoutAction.bind(null, shoutout.id)}
          reasons={REPORT_REASONS}
          cancelHref={`/shoutouts/${shoutout.id}`}
        />
      </main>
    </>
  );
}
