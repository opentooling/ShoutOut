import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { signInWithKeycloak } from "@/app/actions/auth";
import { Logo } from "@/components/brand/logo";
import { findCardDesign } from "@/components/cards/designs";
import { CardTile } from "@/components/cards/card-tile";
import { buttonClasses } from "@/components/ui/button";
import { signInErrorMessage } from "@/server/auth/sign-in-errors";

export const metadata: Metadata = { title: "Sign in" };

const FAN = ["thank-you", "above-and-beyond", "team-player"].map((slug) => findCardDesign(slug)!);
const FAN_STYLES = ["-rotate-6 translate-y-3", "z-10 -translate-y-1", "rotate-6 translate-y-3"];

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }
  const errorMessage = signInErrorMessage((await searchParams).error);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
      <div className="grid w-full max-w-5xl items-center gap-10 md:grid-cols-2 [&>*]:min-w-0">
        <section className="text-center md:text-left">
          <Logo className="mx-auto h-12 md:mx-0 md:h-14" />
          <h1 className="mt-8 font-display text-4xl font-semibold leading-tight sm:text-5xl">
            Recognise the people who make work better.
          </h1>
          <p className="mt-4 text-lg text-muted">
            Say thanks, celebrate wins and cheer on your colleagues with a ShoutOut card.
          </p>
          {errorMessage && (
            <p
              role="alert"
              className="mt-6 rounded-2xl bg-coral-soft px-4 py-3 text-left font-bold text-coral-strong"
            >
              {errorMessage}
            </p>
          )}
          <form action={signInWithKeycloak} className="mt-8">
            <button
              type="submit"
              className={buttonClasses({ size: "lg", className: "w-full sm:w-auto" })}
            >
              Sign in with your work account
            </button>
          </form>
        </section>
        <div
          aria-hidden
          className="mx-auto flex max-w-full items-start justify-center -space-x-4 sm:-space-x-6"
        >
          {FAN.map((design, i) => (
            <CardTile
              key={design.slug}
              design={design}
              className={`w-[7.5rem] shadow-card sm:w-44 ${FAN_STYLES[i]}`}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
