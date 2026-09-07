import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { LEARN_CATEGORIES } from "./learn-data";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Learn") };
}

export default async function LearnPage() {
  const supabase = await createSupabaseServerClient();
  const { content } = await getPublicSite(supabase);
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
        <Link
          href="/gears/sizing"
          className="underline underline-offset-4 hover:text-foreground"
        >
          sizing guide
        </Link>
        .
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LEARN_CATEGORIES.map((category) => (
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
    </div>
  );
}
