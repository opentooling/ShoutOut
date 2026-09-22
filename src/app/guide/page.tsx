import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { RichText } from "@/components/guide/rich-text";
import { SiteHeader } from "@/components/layout/site-header";
import screenshots from "@/content/guide-screenshots.json";
import { GUIDE_INTRO, GUIDE_SECTIONS, GUIDE_TITLE, type GuideSection } from "@/content/user-guide";

export const metadata: Metadata = {
  title: "User guide",
  description: "How to use ShoutOut, with screenshots.",
};

const SIZES: Record<string, { width: number; height: number } | undefined> = screenshots;

function Section({ section }: { section: GuideSection }) {
  const shot = section.screenshot;
  const size = SIZES[shot.file];
  return (
    <section
      id={section.id}
      aria-labelledby={`${section.id}-heading`}
      className="scroll-mt-24 rounded-[var(--radius-card)] border-2 border-border bg-surface p-6 shadow-card sm:p-8"
    >
      <h3 id={`${section.id}-heading`} className="font-display text-2xl font-semibold">
        {section.title}
      </h3>
      <p className="mt-2">
        <RichText text={section.intro} />
      </p>
      {section.steps && (
        <ol className="mt-4 list-decimal space-y-2 pl-6">
          {section.steps.map((step) => (
            <li key={step}>
              <RichText text={step} />
            </li>
          ))}
        </ol>
      )}
      {section.tips && (
        <ul className="mt-4 space-y-2 rounded-2xl bg-sunny-soft p-4 text-sm">
          {section.tips.map((tip) => (
            <li key={tip} className="flex gap-2">
              <span aria-hidden>💡</span>
              <span>
                <RichText text={tip} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {size && (
        <figure className="mt-6">
          {/* Opens full size: handy on phones, where full-page screenshots are small. */}
          <a href={`/guide/${shot.file}`} target="_blank" rel="noopener">
            <Image
              src={`/guide/${shot.file}`}
              alt={shot.alt}
              width={size.width}
              height={size.height}
              unoptimized
              className="h-auto w-full rounded-2xl border-2 border-border"
            />
          </a>
          <figcaption className="mt-2 text-xs text-muted">
            Select the picture to see it full size.
          </figcaption>
        </figure>
      )}
    </section>
  );
}

function Contents({ sections }: { sections: GuideSection[] }) {
  return (
    <ol className="mt-2 space-y-1">
      {sections.map((s) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className="font-bold text-teal-strong hover:underline">
            {s.title}
          </a>
        </li>
      ))}
    </ol>
  );
}

export default async function GuidePage() {
  const session = await auth();
  const everyone = GUIDE_SECTIONS.filter((s) => s.audience === "everyone");
  const admins = GUIDE_SECTIONS.filter((s) => s.audience === "admins");

  return (
    <>
      <SiteHeader user={session?.user} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        <div className="text-center">
          <h1 className="font-display text-4xl font-semibold">{GUIDE_TITLE}</h1>
          <p className="mx-auto mt-3 max-w-xl text-lg text-muted">{GUIDE_INTRO}</p>
          <p className="mt-2 text-sm text-muted">
            Wondering why it works the way it does?{" "}
            <Link href="/about" className="font-bold text-teal-strong hover:underline">
              Read about ShoutOut
            </Link>
            .
          </p>
        </div>

        <nav
          aria-label="Guide contents"
          className="grid gap-6 rounded-[var(--radius-card)] border-2 border-border bg-surface p-6 sm:grid-cols-2"
        >
          <div>
            <h2 className="font-display text-lg font-semibold">Using ShoutOut</h2>
            <Contents sections={everyone} />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold">For admins</h2>
            <Contents sections={admins} />
          </div>
        </nav>

        <h2 className="pt-4 font-display text-3xl font-semibold">Using ShoutOut</h2>
        {everyone.map((section) => (
          <Section key={section.id} section={section} />
        ))}

        <h2 className="pt-4 font-display text-3xl font-semibold">For admins</h2>
        {admins.map((section) => (
          <Section key={section.id} section={section} />
        ))}
      </main>
    </>
  );
}
