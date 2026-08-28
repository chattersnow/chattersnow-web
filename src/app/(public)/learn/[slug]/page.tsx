import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { LEARN_CATEGORIES, getLearnCategory } from "../learn-data";
import { ParkRidingSafetySections } from "../park-riding-safety/park-riding-safety-sections";
import { PARK_SAFETY_ARTICLES } from "../park-riding-safety/park-riding-safety-data";
import { GettingStartedSections } from "../getting-started/getting-started-sections";
import { GETTING_STARTED_ARTICLES } from "../getting-started/getting-started-data";
import { GearCareSections } from "../gear-care/gear-care-sections";
import { GEAR_CARE_ARTICLES } from "../gear-care/gear-care-data";

const CATEGORY_CONTENT: Record<string, () => React.ReactNode> = {
  "getting-started": () => <GettingStartedSections />,
  "park-riding-safety": () => <ParkRidingSafetySections />,
  "gear-care": () => <GearCareSections />,
};

const CATEGORY_NAV: Record<string, { href: string; label: string }[]> = {
  "getting-started": GETTING_STARTED_ARTICLES.map((article) => ({
    href: `#${article.id}`,
    label: article.title,
  })),
  "park-riding-safety": PARK_SAFETY_ARTICLES.map((article) => ({
    href: `#${article.id}`,
    label: article.title,
  })),
  "gear-care": GEAR_CARE_ARTICLES.map((article) => ({
    href: `#${article.id}`,
    label: article.title,
  })),
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
  return { title: category ? `${category.title} | Chatter Snow` : "Learn" };
}

export default async function LearnCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const category = getLearnCategory((await params).slug);
  if (!category) notFound();

  const nav = CATEGORY_NAV[category.slug];
  const renderContent = CATEGORY_CONTENT[category.slug];

  return (
    <div>
      <Link
        href="/learn"
        className="app-muted inline-flex items-center gap-1 text-sm hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Learn
      </Link>
      <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        {category.title}
      </h1>
      <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
        {category.description}
      </p>

      {nav && (
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

      {renderContent ? (
        <div className="mt-10 space-y-12">{renderContent()}</div>
      ) : (
        <p className="app-muted mt-10 text-sm italic">
          Articles for this category are coming soon.
        </p>
      )}
    </div>
  );
}
