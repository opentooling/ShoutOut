import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { AppHeader, type HeaderUser } from "./app-header";

/** Header for pages anyone can read: the full app header when signed in, otherwise logo and sign-in. */
export function SiteHeader({ user }: { user?: HeaderUser | null }) {
  if (user) return <AppHeader user={user} />;
  return (
    <header className="border-b-2 border-border">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" aria-label="ShoutOut home">
          <Logo className="h-9" />
        </Link>
        <Link href="/signin" className={buttonClasses({ variant: "secondary", size: "sm" })}>
          Sign in
        </Link>
      </div>
    </header>
  );
}
