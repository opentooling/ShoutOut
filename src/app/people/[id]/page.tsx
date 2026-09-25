import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updateEmailPreferencesAction } from "@/app/actions/notifications";
import { auth } from "@/auth";
import { AppHeader } from "@/components/layout/app-header";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { EmailPreferencesForm } from "@/components/notifications/email-preferences-form";
import { FeedList } from "@/components/shoutouts/feed-list";
import { Avatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db";
import { getThemePreference } from "@/lib/theme-server";
import { activeEmailConfig } from "@/server/notifications/email-config";
import { getEmailPreferences } from "@/server/notifications/preferences";
import { getProfile, listProfileShoutouts, type ProfileTab } from "@/server/users/profile";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({ params, searchParams }: PageProps<"/people/[id]">) {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }
  const { user } = session;
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const tab: ProfileTab = query.tab === "sent" ? "sent" : "received";
  const cursor = typeof query.cursor === "string" ? query.cursor : undefined;
  const db = getDb();
  const now = new Date();
  const profile = await getProfile(db, user.id, id);
  if (!profile) {
    notFound();
  }
  const page = await listProfileShoutouts(db, user.id, id, tab, { cursor, now });
  const { person } = profile;
  const emailConfig = profile.isSelf ? activeEmailConfig() : null;
  const firstName = person.name.split(" ")[0];

  const tabs: { key: ProfileTab; label: string; count: number }[] = [
    { key: "received", label: "Received", count: profile.received },
    { key: "sent", label: "Sent", count: profile.sent },
  ];

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        <section className="rounded-[var(--radius-card)] border-2 border-border bg-surface p-6 shadow-card sm:p-8">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={person.name} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-3xl font-semibold">
                {person.name}
                {profile.isSelf && <span className="text-muted"> (you)</span>}
              </h1>
              <p className="text-muted">{person.email}</p>
              {!person.active && (
                <p className="mt-1 inline-block rounded-full bg-surface-muted px-3 py-0.5 text-xs font-bold text-muted">
                  No longer active
                </p>
              )}
            </div>
            {!profile.isSelf && person.active && (
              <Link href="/shoutouts/new" className={buttonClasses()}>
                Recognise {firstName}
              </Link>
            )}
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-3">
            {tabs.map((t) => (
              <div key={t.key} className="rounded-2xl bg-surface-muted p-4 text-center">
                <dt className="text-sm font-bold text-muted">Shoutouts {t.label.toLowerCase()}</dt>
                <dd className="font-display text-3xl font-semibold">{t.count}</dd>
              </div>
            ))}
          </dl>
          {profile.topValues.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-bold text-muted">Recognised most for</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {profile.topValues.map((value) => (
                  <li
                    key={value.name}
                    className="rounded-full bg-teal-soft px-3 py-1 font-bold text-teal-strong"
                  >
                    #{value.name} <span className="font-normal">×{value.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {profile.isSelf ? (
            <>
              <div className="mt-6 flex items-center justify-between gap-3 border-t-2 border-border pt-4">
                <h2 className="text-sm font-bold text-muted">Appearance</h2>
                <ThemeToggle initial={await getThemePreference()} />
              </div>
              {emailConfig && (
                <div
                  id="email-settings"
                  className="mt-4 scroll-mt-24 space-y-3 border-t-2 border-border pt-4"
                >
                  <h2 className="text-sm font-bold text-muted">Email me</h2>
                  <EmailPreferencesForm
                    initial={await getEmailPreferences(db, user.id)}
                    reminderDays={emailConfig.reminderDays}
                    action={updateEmailPreferencesAction}
                  />
                </div>
              )}
            </>
          ) : (
            <p className="mt-4 text-xs text-muted">Only public shoutouts are shown.</p>
          )}
        </section>

        <nav aria-label="Profile tabs" className="flex gap-2">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/people/${person.id}${t.key === "sent" ? "?tab=sent" : ""}`}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 font-bold transition",
                tab === t.key
                  ? "bg-foreground text-background"
                  : "text-muted hover:bg-surface-muted",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <FeedList
          items={page.items}
          viewerName={user.name ?? user.email ?? "You"}
          now={now}
          nextHref={
            page.nextCursor
              ? `/people/${person.id}?${tab === "sent" ? "tab=sent&" : ""}cursor=${page.nextCursor}`
              : null
          }
          emptyText={
            tab === "sent"
              ? `${profile.isSelf ? "You haven't" : `${firstName} hasn't`} sent any shoutouts yet.`
              : `${profile.isSelf ? "You haven't" : `${firstName} hasn't`} received any shoutouts yet.`
          }
        />
      </main>
    </>
  );
}
