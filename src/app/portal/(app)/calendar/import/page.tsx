import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HowToSection, HowToSheet } from "@/components/how-to-sheet";
import { formatDateInZone } from "@/lib/time";
import { getMissingCoverageSeriesForYear } from "../queries";
import { GenerateMissingButton } from "./generate-missing-button";
import { GenerateSeriesButton } from "./generate-series-button";
import { CsvImportPanel } from "./csv-import-panel";

type CalendarImportPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CalendarImportPage({
  searchParams,
}: CalendarImportPageProps) {
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;
  const yearParam = params.year;
  const defaultYear = new Date().getUTCFullYear() + 1;
  const targetYear = Number(
    (Array.isArray(yearParam) ? yearParam[0] : yearParam) ?? defaultYear,
  );

  const missing = await getMissingCoverageSeriesForYear(supabase, targetYear);

  return (
    <>
      <div className="rainbow-accent w-16" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Calendar Import
        </h1>
        <HowToSheet title="How calendar import works">
          <HowToSection heading="Steps">
            <ol className="list-decimal space-y-2 pl-4">
              <li>
                <strong className="text-foreground">
                  Generate missing instances
                </strong>{" "}
                — for each recurring Tier 1/2 observance missing a date in the
                target year, generate just that one series, or use Generate all
                to fill in every missing one at once.
              </li>
              <li>
                <strong className="text-foreground">Bulk import</strong> — the
                CSV importer adds new one-off dates from an external list.
              </li>
            </ol>
          </HowToSection>
          <HowToSection heading="Who can do this">
            <p>Anyone with manage access to the content calendar.</p>
          </HowToSection>
          <HowToSection heading="What happens downstream">
            <ul className="list-disc space-y-2 pl-4">
              <li>
                Either path only creates internal <code>idea</code>-status
                drafts — nothing is published automatically. Everything still
                goes through the normal sign-off on the main{" "}
                <Link
                  href="/portal/calendar"
                  className="underline hover:text-foreground"
                >
                  Calendar
                </Link>{" "}
                page.
              </li>
              <li>
                New rows count toward that same page&apos;s audit log, just like
                any other calendar item.
              </li>
            </ul>
          </HowToSection>
          <HowToSection heading="Common mistakes">
            <ul className="list-disc space-y-2 pl-4">
              <li>
                Assuming a generated or imported item is already public — it
                isn&apos;t, until someone reviews it and sets its status and
                visibility on the Calendar page.
              </li>
              <li>
                Re-importing the same CSV can create duplicate one-off items —
                check the target year&apos;s coverage first. Re-running Generate
                all for an already-covered year is harmless, since it only fills
                gaps.
              </li>
            </ul>
          </HowToSection>
        </HowToSheet>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Missing recurring instances for {targetYear}</CardTitle>
        </CardHeader>
        <CardContent>
          {missing.length === 0 ? (
            <p className="app-muted text-sm">
              Every recurring Tier 1/2 observance already has a {targetYear}{" "}
              instance.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <ul className="flex flex-col gap-3">
                {missing.map(({ seriesKey, sourceItem }) => (
                  <li
                    key={seriesKey}
                    className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">{sourceItem.title}</p>
                      <p className="app-muted text-xs">
                        Last dated{" "}
                        {formatDateInZone(
                          new Date(sourceItem.starts_at),
                          sourceItem.time_zone,
                        )}
                      </p>
                    </div>
                    <GenerateSeriesButton itemId={sourceItem.id} />
                  </li>
                ))}
              </ul>
              <div className="flex justify-end">
                <GenerateMissingButton targetYear={targetYear} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Bulk import new observances</CardTitle>
        </CardHeader>
        <CardContent>
          <CsvImportPanel />
        </CardContent>
      </Card>
    </>
  );
}
