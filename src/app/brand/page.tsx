import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { DEFAULT_CARD_DESIGNS, findCardDesign } from "@/components/cards/designs";
import { CardTile } from "@/components/cards/card-tile";
import { ShoutoutCard } from "@/components/cards/shoutout-card";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getThemePreference } from "@/lib/theme-server";

export const metadata: Metadata = { title: "Brand" };

const SWATCHES = [
  { name: "Sunny", token: "sunny", classes: ["bg-sunny", "bg-sunny-strong", "bg-sunny-soft"] },
  { name: "Teal", token: "teal", classes: ["bg-teal", "bg-teal-strong", "bg-teal-soft"] },
  { name: "Coral", token: "coral", classes: ["bg-coral", "bg-coral-strong", "bg-coral-soft"] },
  { name: "Lilac", token: "lilac", classes: ["bg-lilac", "bg-lilac-strong", "bg-lilac-soft"] },
  { name: "Sky", token: "sky", classes: ["bg-sky", "bg-sky-strong", "bg-sky-soft"] },
  { name: "Leaf", token: "leaf", classes: ["bg-leaf", "bg-leaf-strong", "bg-leaf-soft"] },
];

const NEUTRALS = [
  { name: "Background", className: "bg-background" },
  { name: "Surface", className: "bg-surface" },
  { name: "Surface muted", className: "bg-surface-muted" },
  { name: "Border", className: "bg-border" },
  { name: "Muted", className: "bg-muted" },
  { name: "Foreground", className: "bg-foreground" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Living style guide for the ShoutOut brand. */
export default async function BrandPage() {
  const theme = await getThemePreference();
  return (
    <main className="mx-auto w-full max-w-5xl space-y-12 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Logo className="h-12" />
          <p className="mt-2 text-muted">Brand guidelines: warm, friendly and a little playful.</p>
        </div>
        <ThemeToggle initial={theme} />
      </header>

      <Section title="Logo">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center justify-center rounded-[var(--radius-card)] border-2 border-border bg-surface p-8">
            <Logo className="h-12" />
          </div>
          <div className="flex items-center justify-center rounded-[var(--radius-card)] border-2 border-border bg-surface p-8">
            <Logo variant="mark" className="size-20" />
          </div>
          <div className="flex items-center justify-center rounded-[var(--radius-card)] bg-teal-strong p-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="App icon" className="size-20 rounded-2xl" />
          </div>
        </div>
        <p className="text-sm text-muted">
          Keep clear space of at least the heart&apos;s width around the logo. Don&apos;t recolour,
          stretch or rotate it.
        </p>
      </Section>

      <Section title="Colour">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {SWATCHES.map((swatch) => (
            <li
              key={swatch.token}
              className="overflow-hidden rounded-2xl border-2 border-border bg-surface"
            >
              <div className="flex h-20">
                {swatch.classes.map((c) => (
                  <span key={c} className={`flex-1 ${c}`} />
                ))}
              </div>
              <p className="px-3 py-2 text-sm">
                <span className="font-bold">{swatch.name}</span>{" "}
                <code className="text-muted">--{swatch.token}</code>
              </p>
            </li>
          ))}
        </ul>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {NEUTRALS.map((n) => (
            <li key={n.name} className="text-center text-xs text-muted">
              <span className={`block h-12 rounded-xl border-2 border-border ${n.className}`} />
              {n.name}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Typography">
        <div className="space-y-2 rounded-[var(--radius-card)] border-2 border-border bg-surface p-6">
          <p className="font-display text-5xl font-semibold">Fredoka for headings</p>
          <p className="font-display text-2xl">Rounded, friendly and bold</p>
          <p className="text-lg">Nunito for body text. Easy to read, soft and approachable.</p>
          <p className="text-sm text-muted">Muted text for supporting details.</p>
        </div>
      </Section>

      <Section title="Buttons & avatars">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Send a shoutout</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex items-center gap-2">
          {[
            "Alice Anders",
            "Bob Baker",
            "Carol Chen",
            "Dave Diaz",
            "Erin Evans",
            "Frank Fischer",
          ].map((name) => (
            <Avatar key={name} name={name} />
          ))}
        </div>
      </Section>

      <Section title="Cards">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {DEFAULT_CARD_DESIGNS.map((design) => (
            <li key={design.slug}>
              <CardTile design={design} className="h-full" />
            </li>
          ))}
        </ul>
        <div className="grid gap-6 md:grid-cols-2">
          <ShoutoutCard
            design={findCardDesign("above-and-beyond")!}
            from="Alice Anders"
            to={["Bob Baker"]}
            values={["Ownership"]}
            message="Thanks for staying late to get the release over the line. The whole team noticed!"
          />
          <ShoutoutCard
            design={findCardDesign("welcome-aboard")!}
            from="Carol Chen"
            to={["Dave Diaz", "Erin Evans", "Frank Fischer"]}
            values={["Teamwork"]}
            message="Welcome to the team! We're so happy to have you with us."
          />
        </div>
      </Section>
    </main>
  );
}
