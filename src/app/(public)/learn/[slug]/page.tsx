import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { LEARN_CATEGORIES, getLearnCategory } from "../learn-data";

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
      <p className="app-muted mt-10 text-sm italic">
        Articles for this category are coming soon.
      </p>
    </div>
  );
}
