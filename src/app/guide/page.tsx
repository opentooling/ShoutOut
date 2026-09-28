import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { GuideToc } from "@/components/guide/guide-toc";
import { RichText } from "@/components/guide/rich-text";
import { SiteHeader } from "@/components/layout/site-header";
import screenshots from "@/content/guide-screenshots.json";
import {
  GUIDE_INTRO,
  GUIDE_TITLE,
  guideSections,
  type ResolvedGuideSection,
} from "@/content/user-guide";
import { loadConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "User guide",
  description: "How to use ShoutOut, with screenshots.",
};

const SIZES: Record<string, { width: number; height: number } | undefined> = screenshots;

function Section({ section }: { section: ResolvedGuideSection }) {
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

export default async function GuidePage() {
  const session = await auth();
  // Only the features this installation uses.
  const config = loadConfig();
  const sections = guideSections({ points: config.points.enabled, budget: config.budgetEnabled });
  const everyone = sections.filter((s) => s.audience === "everyone");
  const admins = sections.filter((s) => s.audience === "admins");

  const groups = [
    { title: "Using ShoutOut", items: everyone },
    { title: "For admins", items: admins },
  ].filter((group) => group.items.length > 0);

  return (
    <>
      <SiteHeader user={session?.user} />
      <div className="page-width flex-1 px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="font-display text-4xl font-semibold">{GUIDE_TITLE}</h1>
          <p className="mt-3 max-w-2xl text-lg text-muted">{GUIDE_INTRO}</p>
          <p className="mt-2 text-sm text-muted">
            Wondering why it works the way it does?{" "}
            <Link href="/about" className="font-bold text-teal-strong hover:underline">
              Read about ShoutOut
            </Link>
            .
          </p>
        </div>
        <div className="grid items-start gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
          <GuideToc
            groups={groups.map((group) => ({
              title: group.title,
              items: group.items.map(({ id, title }) => ({ id, title })),
            }))}
          />
          <main className="min-w-0 space-y-12">
            {groups.map((group) => (
              <div key={group.title} className="space-y-6">
                <h2 className="font-display text-3xl font-semibold">{group.title}</h2>
                {group.items.map((section) => (
                  <Section key={section.id} section={section} />
                ))}
              </div>
            ))}
          </main>
        </div>
      </div>
    </>
  );
}
