import Link from "next/link";
import { LearnSection, LearnDisclaimer } from "../learn-section";
import { PARK_SAFETY_ARTICLES } from "./park-riding-safety-data";

export function ParkRidingSafetySections() {
  return (
    <>
      {PARK_SAFETY_ARTICLES.map((article) => (
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
