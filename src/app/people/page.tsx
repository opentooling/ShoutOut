import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/layout/app-header";
import { PeopleSearch } from "@/components/people/people-search";
import { Avatar } from "@/components/ui/avatar";
import { getDb } from "@/lib/db";
import { searchPeople } from "@/server/users/search";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage({ searchParams }: PageProps<"/people">) {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }
  const { user } = session;
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 100) : "";
  const people = await searchPeople(getDb(), user.id, query, 60, { includeSelf: true });

  return (
    <>
      <AppHeader user={user} />
      <main className="page-width flex-1 space-y-6 px-4 py-8 sm:px-6">
        <h1 className="font-display text-3xl font-semibold">People</h1>
        <PeopleSearch initialQuery={query} />
        <div aria-live="polite" className="sr-only">
          {people.length} {people.length === 1 ? "person" : "people"} found
        </div>
        {people.length === 0 ? (
          <p className="text-muted">Nobody matches &ldquo;{query}&rdquo;.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {people.map((person) => (
              <li key={person.id}>
                <Link
                  href={`/people/${person.id}`}
                  className="flex items-center gap-3 rounded-2xl border-2 border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-card"
                >
                  <Avatar name={person.name} />
                  <span className="min-w-0">
                    <span className="block truncate font-bold">
                      {person.name}
                      {person.id === user.id && <span className="text-muted"> (you)</span>}
                    </span>
                    <span className="block truncate text-sm text-muted">{person.email}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
