import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { getPageVisibility, hiddenSlots } from "@/lib/page-visibility";
import type { LearnArticle } from "../learn-data";
import { LEARN_CATEGORIES, getLearnCategory } from "../learn-data";
import { LearnArticleSections } from "../learn-section";
import { PARK_SAFETY_ARTICLES } from "../park-riding-safety/park-riding-safety-data";
import { GETTING_STARTED_ARTICLES } from "../getting-started/getting-started-data";
import { ETIQUETTE_ARTICLES } from "../etiquette/etiquette-data";
import { GEAR_CARE_ARTICLES } from "../gear-care/gear-care-data";
import { MOUNTAIN_BASICS_ARTICLES } from "../mountain-basics/mountain-basics-data";
import { COMMUNITY_AND_INCLUSION_ARTICLES } from "../community-and-inclusion/community-and-inclusion-data";
import { BUDGET_ARTICLES } from "../budget/budget-data";
import { GEAR_AND_SIZING_ARTICLES } from "../gear-and-sizing/gear-and-sizing-data";

/**
 * The articles each category renders, and the in-page nav is derived from the
 * same list.
 *
 * This was two parallel maps -- one of `() => <XSections />` render functions,
 * one deriving the nav from the article arrays -- behind eight
 * `*-sections.tsx` files that each did nothing but pass their own array to
 * LearnArticleSections. The arrays are what both maps were made of, and going
 * through them directly is what lets this page filter the articles' links
 * against page visibility: a render function taking no arguments had nowhere
 * to put them.
 */
const CATEGORY_ARTICLES: Record<string, readonly LearnArticle[]> = {
  "getting-started": GETTING_STARTED_ARTICLES,
  etiquette: ETIQUETTE_ARTICLES,
  "park-riding-safety": PARK_SAFETY_ARTICLES,
  "mountain-basics": MOUNTAIN_BASICS_ARTICLES,
  "gear-care": GEAR_CARE_ARTICLES,
  "community-and-inclusion": COMMUNITY_AND_INCLUSION_ARTICLES,
  budget: BUDGET_ARTICLES,
  "gear-and-sizing": GEAR_AND_SIZING_ARTICLES,
};

export function generateStaticParams() {
  return LEARN_CATEGORIES.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const category = getLearnCategory((await params).slug);
  const supabase = await createSupabaseServerClient();
  const site = await getPublicSite(supabase);
  return { title: publicTitle(site, category ? category.title : "Learn") };
}

export default async function LearnCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const category = getLearnCategory((await params).slug);
  if (!category) notFound();

  const supabase = await createSupabaseServerClient();
  const hidden = hiddenSlots(await getPageVisibility(supabase));

  const articles = CATEGORY_ARTICLES[category.slug];
  const nav = articles?.map((article) => ({
    href: `#${article.id}`,
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

      {nav && nav.length > 0 && (
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

      {articles ? (
        <div className="mt-10 space-y-12">
          <LearnArticleSections articles={articles} hidden={hidden} />
        </div>
      ) : (
        <p className="app-muted mt-10 text-sm italic">
          Articles for this category are coming soon.
        </p>
      )}
    </div>
  );
}
