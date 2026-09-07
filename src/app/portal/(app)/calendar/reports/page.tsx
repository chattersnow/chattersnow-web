import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  computeAnnualReview,
  type AnnualReview,
  type AnnualReviewItemRow,
  type AnnualReviewOpportunityRow,
  type AnnualReviewPermissionRow,
} from "./annual-review";
import { formatNumber } from "@/lib/format";
import {
  fiscalYearForDate,
  fiscalYearOptions,
  fiscalYearRange,
  formatFiscalYearLabel,
  getFiscalYearStartMonth,
} from "@/lib/fiscal-year";

type AnnualReviewData = {
  items: AnnualReviewItemRow[];
  opportunities: AnnualReviewOpportunityRow[];
  permissions: AnnualReviewPermissionRow[];
};

function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function formatDays(days: number | null): string {
  if (days === null) return "—";
  return `${formatNumber(Math.round(days * 10) / 10)} days`;
}

type CalendarAnnualReviewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Annual Review",
};

export default async function CalendarAnnualReviewPage({
  searchParams,
}: CalendarAnnualReviewPageProps) {
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  // The review is scoped to the org's fiscal year, not the calendar year, so
  // a winter season's planning sits in one report. `year` in the URL is the
  // fiscal year, named for the calendar year it ends in.
  const startMonth = await getFiscalYearStartMonth(supabase);
  const currentYear = fiscalYearForDate(new Date(), startMonth);
  const requestedYear = Number(raw("year"));
  const year = Number.isInteger(requestedYear) ? requestedYear : currentYear;
  const yearOptions = fiscalYearOptions(new Date(), startMonth);
  const range = fiscalYearRange(year, startMonth);

  let review: AnnualReview | null = null;
  let loadError: string | null = null;

  const { data, error } = await supabase.rpc(
    "get_calendar_annual_review_data",
    {
      p_from: range.from,
      p_to: range.to,
    },
  );

  if (error) {
    loadError =
      "Could not load the annual planning review report. Please try again.";
  } else {
    const result = (data ?? {}) as AnnualReviewData;
    review = computeAnnualReview(
      result.items ?? [],
      result.opportunities ?? [],
      result.permissions ?? [],
    );
  }

  const selectClassName =
    "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

  const metricCards = review
    ? [
        {
          label: "Tier 1 items with a decision",
          value: formatPercent(review.tier1Decided, review.tier1Total),
          detail: `${formatNumber(review.tier1Decided)} of ${formatNumber(review.tier1Total)}`,
        },
        {
          label: "Planned opportunities completed on time",
          value: formatPercent(
            review.plannedCompletedOnTime,
            review.plannedWithPublishTarget,
          ),
          detail: `${formatNumber(review.plannedCompletedOnTime)} of ${formatNumber(review.plannedWithPublishTarget)}`,
        },
        {
          label: "Overdue content tasks",
          value: formatNumber(review.overdueCount),
        },
        {
          label: "Median time to first review",
          value: formatDays(review.medianBriefToReviewDays),
          detail:
            "Only counts opportunities currently in review — status history before the most recent transition isn't tracked.",
        },
        {
          label: "Public items with a clear Chatter connection",
          value: formatNumber(review.publicWithConnectionCount),
        },
        {
          label: "Publication permissions recorded",
          value: formatNumber(review.permissionsRecordedCount),
        },
      ]
    : [];

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Annual Planning Review
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Fiscal-year rollup of the content calendar&apos;s planning-cycle success
        measures, computed live from calendar items, content-opportunity briefs,
        and recorded publication permissions.
      </p>

      <div className="rainbow-surface mt-6 flex flex-wrap items-end justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="year"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Fiscal year
            </label>
            <select
              id="year"
              name="year"
              defaultValue={String(year)}
              className={selectClassName}
            >
              {yearOptions.map((option) => (
                <option key={option} value={option}>
                  {formatFiscalYearLabel(option)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary">
            View
          </Button>
        </form>
      </div>

      {loadError ? (
        <Card className="mt-6">
          <CardContent className="app-muted px-4 py-6 text-sm">
            {loadError}
          </CardContent>
        </Card>
      ) : review &&
        review.tier1Total === 0 &&
        review.plannedWithPublishTarget === 0 &&
        review.overdueCount === 0 &&
        review.publicWithConnectionCount === 0 &&
        review.permissionsRecordedCount === 0 ? (
        <Card className="mt-6">
          <CardContent className="app-muted px-4 py-6 text-sm">
            No calendar items in {year}.
          </CardContent>
        </Card>
      ) : review ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metricCards.map((card) => (
            <Card key={card.label}>
              <CardHeader>
                <CardTitle className="app-muted text-sm font-semibold">
                  {card.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="brand-display text-4xl font-semibold tracking-[-0.04em]">
                  {card.value}
                </p>
                {"detail" in card && card.detail ? (
                  <p className="app-muted mt-1 text-xs">{card.detail}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </>
  );
}
