import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { getPublicPublications } from "@/lib/public-publications";
import { formatCalendarDate } from "@/lib/format";
import { PublicationCover } from "./publication-cover";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  const site = await getPublicSite(supabase);
  return {
    title: publicTitle(site, site.lexicon.publication_plural),
  };
}

/** Every published issue as a cover card, newest first (#1471). */
export default async function PublicationsPage() {
  const supabase = await createSupabaseServerClient();
  const [{ lexicon }, issues] = await Promise.all([
    getPublicSite(supabase),
    getPublicPublications(supabase),
  ]);

  return (
    <div>
      <div className="w-fit max-w-full">
        <div className="rainbow-accent w-full" />
        <h1 className="brand-display mt-4 text-4xl font-semibold tracking-brand break-words sm:text-5xl">
          {lexicon.publication_plural}
        </h1>
      </div>

      {issues.length > 0 ? (
        <ul className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {issues.map((issue, index) => (
            <li key={issue.id} className="min-w-0">
              <Link
                href={`/publications/${issue.slug}`}
                className="group block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:outline-none"
              >
                <PublicationCover
                  cover={issue.cover}
                  title={issue.title}
                  sizes="(min-width: 1024px) 352px, (min-width: 640px) 45vw, 100vw"
                  priority={index === 0}
                  className="transition-opacity group-hover:opacity-90"
                />
                <h2 className="mt-4 text-lg font-semibold break-words underline-offset-4 group-hover:underline">
                  {issue.title}
                </h2>
                <p className="app-muted mt-1 text-sm">
                  {[
                    issue.seasonLabel,
                    issue.publishDate
                      ? formatCalendarDate(issue.publishDate)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="app-muted mt-10 text-sm italic">
          Nothing has been published here yet.
        </p>
      )}
    </div>
  );
}
