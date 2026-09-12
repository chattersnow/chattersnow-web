import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicArticleCategories } from "@/lib/public-articles";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { isPageVisible } from "@/lib/page-visibility";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Learn") };
}

export default async function LearnPage() {
  const supabase = await createSupabaseServerClient();
  const [{ content }, sizingVisible, categories] = await Promise.all([
    getPublicSite(supabase),
    isPageVisible("gears-sizing"),
    getPublicArticleCategories(supabase),
  ]);
  return (
    <div>
      <div className="w-fit">
        <div className="rainbow-accent w-full" />
        <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          {content.text("learn.heading")}
        </h1>
      </div>
      <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
        {content.text("learn.intro")}{" "}
        {/* The copy runs into the link mid-sentence ("... Check the" + "sizing
            guide."), so a tenant with the guide hidden gets the same sentence
            with the words unlinked rather than a dangling clause. */}
        {sizingVisible ? (
          <Link
            href="/inventory/sizing"
            className="underline underline-offset-4 hover:text-foreground"
          >
            sizing guide
          </Link>
        ) : (
          "sizing guide"
        )}
        .
      </p>

      {categories.length > 0 ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <Link key={category.slug} href={`/learn/${category.slug}`}>
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle>{category.title}</CardTitle>
                  <CardDescription>{category.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        /* An organization that has published no articles gets an empty section
           rather than somebody else's guides, which is the whole point of
           #894. Said out loud rather than rendered as a blank gap. */
        <p className="app-muted mt-10 text-sm italic">
          There are no guides here yet.
        </p>
      )}
    </div>
  );
}
