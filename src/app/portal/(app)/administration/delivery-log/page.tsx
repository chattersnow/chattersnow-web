import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildHref, PAGE_SIZE, totalPagesFor } from "@/lib/pagination";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DeliveryLogFilterForm } from "./delivery-log-filter-form";
import { parseDeliveryLogParams, type SortColumn } from "./delivery-log-params";
import { DeliveryLogTable } from "./delivery-log-table";
import { fetchDeliveryLogEntries } from "./delivery-log-query";

const PATH = "/portal/administration/delivery-log";

type DeliveryLogPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Email Delivery",
};

/**
 * Every email the platform sends of its own accord, and what became of it
 * (#1310).
 *
 * `notification_deliveries` has recorded all of it since #488 and no screen
 * read it, so "did the artist's confirmation go out?" could only be answered
 * by reading application source and asking somebody with a Resend login --
 * neither of which an organization running on this platform has.
 *
 * Modelled on the audit log next door, down to the params module and the
 * detail sheet, because it is the same shape of screen: a read-only ledger
 * filtered from the URL.
 */
export default async function DeliveryLogPage({
  searchParams,
}: DeliveryLogPageProps) {
  const supabase = await createSupabaseServerClient();
  const filters = parseDeliveryLogParams(await searchParams);

  const { entries, error, count } = await fetchDeliveryLogEntries(
    supabase,
    filters,
  );

  const filterParams = new URLSearchParams();
  if (filters.status !== "all") filterParams.set("status", filters.status);
  if (filters.kind !== "all") filterParams.set("kind", filters.kind);
  if (filters.recipient) filterParams.set("recipient", filters.recipient);
  if (filters.record) filterParams.set("record", filters.record);
  if (filters.from) filterParams.set("from", filters.from);
  if (filters.to) filterParams.set("to", filters.to);
  // On filterParams rather than in each href, so sorting and paging both carry
  // the reader's choice without either having to remember to.
  if (filters.perPage !== PAGE_SIZE)
    filterParams.set("perPage", String(filters.perPage));

  function sortHref(column: SortColumn) {
    const nextDir =
      filters.sort === column && filters.dir === "desc" ? "asc" : "desc";
    return buildHref(PATH, filterParams, { sort: column, dir: nextDir });
  }

  function pageHref(nextPage: number) {
    return buildHref(PATH, filterParams, {
      sort: filters.sort,
      dir: filters.dir,
      page: nextPage,
    });
  }

  function perPageHref(nextPerPage: number) {
    return buildHref(PATH, filterParams, {
      sort: filters.sort,
      dir: filters.dir,
      perPage: nextPerPage,
      page: 1,
    });
  }

  const totalPages = totalPagesFor(count, filters.perPage);
  const showingSkips = filters.status === "all" || filters.status === "skipped";

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Email Delivery
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <p className="app-muted mt-4 max-w-prose text-sm leading-relaxed">
        Every email this organization&rsquo;s account sends automatically —
        receipts, notices to staff, the daily digest, the leadership report —
        with what the email provider said about each one. Messages a staff
        member writes by hand appear on the record they are about, not here. No
        message text is kept.
      </p>

      {/* #1310: a skip is four different situations wearing one word, and only
          one of them leaves a row. Saying so is what keeps this screen from
          being the second dead end after the provider's dashboard. */}
      {showingSkips ? (
        <Alert className="mt-4 max-w-prose">
          <AlertTitle>When an email is not sent</AlertTitle>
          <AlertDescription className="leading-relaxed">
            A row marked <strong>Not sent</strong> says why it was skipped. Some
            sends stop before they reach this ledger and leave no row at all:
            when email is switched off for the whole organization, when an
            automatic reply is switched off for its kind, and when the person
            has no address on file. If a message you expected is missing
            entirely, check those three in Organization Settings and Automatic
            Replies.
          </AlertDescription>
        </Alert>
      ) : null}

      <DeliveryLogFilterForm filters={filters} />

      <DeliveryLogTable
        entries={entries}
        error={error}
        sort={filters.sort}
        dir={filters.dir}
        sortHref={sortHref}
        page={filters.page}
        totalPages={totalPages}
        count={count}
        perPage={filters.perPage}
        pageHref={pageHref}
        perPageHref={perPageHref}
      />
    </>
  );
}
