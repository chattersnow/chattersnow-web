import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { LearnArticle } from "./learn-data";

export function LearnSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="space-y-4 scroll-mt-24">
      <div>
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          {title}
        </h2>
        <p className="app-muted mt-2 max-w-3xl text-sm leading-relaxed sm:text-base">
          {description}
        </p>
      </div>
      <Card>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </section>
  );
}

export function LearnDisclaimer({ children }: { children: ReactNode }) {
  return <p className="app-muted text-xs leading-relaxed">{children}</p>;
}

export function LearnArticleSections({
  articles,
}: {
  articles: readonly LearnArticle[];
}) {
  return (
    <>
      {articles.map((article) => (
        <LearnSection
          key={article.id}
          id={article.id}
          title={article.title}
          description={article.description}
        >
          <ul className="app-muted list-disc space-y-1 pl-5 text-sm leading-relaxed">
            {article.list.map((item) => (
              <li key={item.label}>
                <span className="font-medium text-foreground">
                  {item.label}
                </span>{" "}
                — {item.text}
              </li>
            ))}
          </ul>
          {article.paragraphs.map((paragraph) => (
            <p
              key={paragraph}
              className="app-muted text-sm leading-relaxed sm:text-base"
            >
              {paragraph}
            </p>
          ))}
          {article.links.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {article.links.map((link) =>
                link.internal ? (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="underline underline-offset-4 hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ) : (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4 hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ),
              )}
            </ul>
          )}
          <LearnDisclaimer>{article.disclaimer}</LearnDisclaimer>
        </LearnSection>
      ))}
    </>
  );
}
