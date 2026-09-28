import Link from "next/link";
import { signOutEverywhere } from "@/app/actions/auth";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { loadConfig } from "@/lib/config";
import { canViewAnalytics, isAdmin } from "@/server/auth/roles";
import { getThemePreference } from "@/lib/theme-server";

export interface HeaderUser {
  id: string;
  name?: string | null;
  email?: string | null;
  roles: string[];
}

/** Main navigation; phones show just the icons. */
export function navItems(user: HeaderUser) {
  return [
    { href: "/", label: "Feed", icon: "🏠" },
    { href: "/people", label: "People", icon: "👥" },
    { href: "/leaderboard", label: "Leaderboard", icon: "🏆" },
    ...(isAdmin(user.roles) ? [{ href: "/admin", label: "Admin", icon: "🛡️" }] : []),
    ...(canViewAnalytics(user.roles, loadConfig().analyticsVisibility)
      ? [{ href: "/analytics", label: "Analytics", icon: "📊" }]
      : []),
    { href: "/about", label: "About", icon: "💡" },
  ];
}

export async function AppHeader({ user }: { user: HeaderUser }) {
  const theme = await getThemePreference();
  return (
    <header className="sticky top-0 z-10 border-b-2 border-border bg-background/90 backdrop-blur">
      <div className="page-width flex items-center justify-between gap-1 px-3 py-3 sm:gap-4 sm:px-6">
        <div className="flex items-center gap-1 sm:gap-6">
          <Link href="/" aria-label="ShoutOut home">
            <Logo variant="mark" className="size-9 sm:hidden" title="ShoutOut" />
            <Logo className="hidden h-9 sm:block" />
          </Link>
          <nav aria-label="Main" className="flex text-sm font-bold sm:gap-1">
            {navItems(user).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-2 py-1.5 hover:bg-surface-muted sm:px-3"
              >
                <span className="sm:hidden" aria-hidden>
                  {item.icon}
                </span>
                <span className="sr-only sm:not-sr-only">{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          {/* On phones the theme switch lives on your profile page to save space. */}
          <div className="hidden sm:block">
            <ThemeToggle initial={theme} />
          </div>
          <Link
            href={`/people/${user.id}`}
            aria-label="Your profile"
            className="flex items-center gap-2 rounded-full sm:pr-2 sm:hover:bg-surface-muted"
          >
            <Avatar name={user.name} size="sm" />
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-bold">{user.name ?? user.email}</p>
              {isAdmin(user.roles) && <p className="text-xs font-bold text-teal-strong">Admin</p>}
            </div>
          </Link>
          <form action={signOutEverywhere}>
            <button
              type="submit"
              className={buttonClasses({ variant: "ghost", size: "sm", className: "px-2 sm:px-3" })}
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
