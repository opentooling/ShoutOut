"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export interface TocGroup {
  title: string;
  items: { id: string; title: string }[];
}

/**
 * "On this page" contents for the guide: sticky beside the sections on wide
 * screens, marking the section being read.
 */
export function GuideToc({ groups }: { groups: TocGroup[] }) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(entry.target.id);
        }
      },
      // A section counts as "being read" once its top reaches the upper third.
      { rootMargin: "0px 0px -70% 0px" },
    );
    for (const group of groups) {
      for (const item of group.items) {
        const section = document.getElementById(item.id);
        if (section) observer.observe(section);
      }
    }
    return () => observer.disconnect();
  }, [groups]);

  return (
    <nav aria-label="Guide contents" className="text-sm lg:sticky lg:top-24">
      <p className="mb-3 text-xs font-bold tracking-wider text-muted uppercase">On this page</p>
      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="mb-1 font-bold">{group.title}</p>
            <ol className="border-l-2 border-border">
              {group.items.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    aria-current={current === item.id ? "true" : undefined}
                    onClick={() => setCurrent(item.id)}
                    className={cn(
                      "-ml-0.5 block border-l-2 py-1 pl-3 transition-colors",
                      current === item.id
                        ? "border-teal-strong font-bold text-foreground"
                        : "border-transparent text-muted hover:border-border hover:text-foreground",
                    )}
                  >
                    {item.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </nav>
  );
}
