import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicArticleCategory } from "@/lib/public-articles";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { getPageVisibility, hiddenSlots } from "@/lib/page-visibility";
import { LearnArticleSections } from "../learn-section";

/**
 * One article category, read from the tenant's own rows (#894).
 *
 * This was eight `*-data.ts` imports and a `CATEGORY_ARTICLES` map keyed by
 * slug, which meant the categories a site could have were the eight Chatter
 * Snow wrote. There is no `generateStaticParams` for the same reason: which
 * slugs exist now depends on which tenant the request host resolves to, so
 * there is no build-time answer.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  const [category, site] = await Promise.all([
    getPublicArticleCategory(supabase, (await params).slug),
    getPublicSite(supabase),
  ]);
  return { title: publicTitle(site, category ? category.title : "Learn") };
}

export default async function LearnCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const [category, visibility] = await Promise.all([
    getPublicArticleCategory(supabase, (await params).slug),
    getPageVisibility(supabase),
  ]);
  if (!category) notFound();

  const hidden = hiddenSlots(visibility);
  const nav = category.articles.map((article) => ({
    href: `#${article.anchor}`,
    label: article.title,
  }));

  return (
    <div>
      <Link
        href="/learn"
        className="app-muted inline-flex items-center gap-1 text-sm hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Learn
      </Link>
      <div className="w-fit">
        <div className="rainbow-accent w-full" />
        <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          {category.title}
        </h1>
      </div>
      <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
        {category.description}
      </p>

      {nav.length > 0 && (
        <nav
          aria-label={`${category.title} articles`}
          className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm"
        >
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="underline underline-offset-4 hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      {category.articles.length > 0 ? (
        <div className="mt-10 space-y-12">
          <LearnArticleSections articles={category.articles} hidden={hidden} />
        </div>
      ) : (
        <p className="app-muted mt-10 text-sm italic">
          Articles for this category are coming soon.
        </p>
      )}
    </div>
  );
}
