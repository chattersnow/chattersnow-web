import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalDocument } from "@/components/legal-document";
import { DATE_TIME_WITH_ZONE, formatDateTimeInZone } from "@/lib/time";
import { publicGiveawayRulesPath } from "@/lib/giveaway-rules-path";
import {
  getPublishedGiveawayRules,
  selectGiveawayRulesVersion,
} from "@/lib/giveaway-rules-publication";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ giveawayId: string }>;
  searchParams: Promise<{ version?: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { giveawayId } = await params;
  const supabase = await createSupabaseServerClient();
  const versions = await getPublishedGiveawayRules(supabase, giveawayId);
  const current = versions[0];

  return {
    title: publicTitle(
      await getPublicSite(supabase),
      current?.content.title ?? "Official Rules",
    ),
    // Superseded versions stay readable for anyone holding the link, but they
    // are not what a search engine should be offering somebody looking for the
    // rules of a live promotion.
    robots: { index: Boolean(current), follow: true },
  };
}

/**
 * A promotion's official rules, as they were published (#1322).
 *
 * Nothing here is rendered from live data. The document is the frozen copy
 * written at publish -- its dates, its prize values and its odds are what they
 * were at that moment -- because the rules are a contract with the people who
 * entered under them, and recomputing the odds on every request would restate
 * what somebody already relied on. An edit is a new version with its own
 * effective date, and the older ones stay reachable at `?version=`.
 */
export default async function GiveawayRulesPage({
  params,
  searchParams,
}: PageProps) {
  const { giveawayId } = await params;
  const { version } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const versions = await getPublishedGiveawayRules(supabase, giveawayId);
  if (!versions.length) notFound();

  const published = selectGiveawayRulesVersion(versions, version);
  if (!published) notFound();

  const isCurrent = published.version === versions[0].version;
  const path = publicGiveawayRulesPath(giveawayId);
  // In the promotion's own timezone, which the document froze with its text.
  const effective = (entry: {
    effective_at: string;
    content: { time_zone: string };
  }) =>
    formatDateTimeInZone(
      entry.effective_at,
      entry.content.time_zone,
      DATE_TIME_WITH_ZONE,
    );

  return (
    <LegalDocument
      doc={{
        title: published.content.title,
        last_updated: effective(published),
        summary: published.content.summary,
        sections: published.content.sections,
      }}
      dateLabel="Effective"
      appendix={
        <section
          id="versions"
          className="border-t border-[var(--line)] pt-6 text-sm"
        >
          <p className="app-muted">
            {isCurrent
              ? `This is version ${published.version} of these rules, and the version in force.`
              : `This is version ${published.version} of these rules. It has been superseded.`}{" "}
            {!isCurrent && (
              <Link href={path} className="underline underline-offset-4">
                Read the rules in force
              </Link>
            )}
          </p>
          {versions.length > 1 && (
            <ul className="app-muted mt-3 space-y-1">
              {versions.map((entry) => (
                <li key={entry.version}>
                  {entry.version === published.version ? (
                    <span>
                      Version {entry.version} — effective {effective(entry)}
                    </span>
                  ) : (
                    <Link
                      href={`${path}?version=${entry.version}`}
                      className="underline underline-offset-4"
                    >
                      Version {entry.version} — effective {effective(entry)}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      }
    />
  );
}
