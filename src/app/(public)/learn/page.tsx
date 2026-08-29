import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { LEARN_CATEGORIES } from "./learn-data";

export const metadata: Metadata = {
  title: "Learn | Chatter Snow",
};

export default function LearnPage() {
  return (
    <div>
      <div className="rainbow-accent w-16" />
      <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Learn
      </h1>
      <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
        Snow sports 101 — orientation basics for anyone new to skiing or riding.
        Looking for equipment size charts specifically? Check the{" "}
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
