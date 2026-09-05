import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { SortHeaderLink } from "@/components/portal/sort-header-link";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type HideBelow,
} from "@/components/ui/table";
import { HowToSection } from "@/components/how-to-section";
import { PageHelpContent } from "../../help/help-context";
import { ActiveFilters, type ActiveFilter } from "@/components/active-filters";
import { FiltersSheet } from "@/components/filters-sheet";
import { SearchField } from "@/components/search-field";
import { FilterSubmitButton } from "@/components/filter-submit-button";
import { LinkPendingPulse } from "@/components/link-pending";
import {
  buildHref,
  escapeLikePattern,
  PAGE_SIZE,
  pageRange,
  parsePage,
  parsePerPage,
  totalPagesFor,
} from "@/lib/pagination";
import type { PersonListItem } from "../../people/actions";
import { EditDonationModal } from "./edit-donation-modal";
import { PaymentMethodBadge } from "./donation-badges";
import { NewDonationDialog } from "./new-donation-dialog";
import {
  DONATION_COLUMNS,
  PAYMENT_METHODS,
  donorLabel,
  isPaymentMethod,
  paymentMethodLabel,
  type EventOption,
  type MonetaryDonationRow,
} from "./donations-shared";
import { formatCalendarDate, formatCurrency } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

type DonationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SORTABLE_COLUMNS = ["received_date", "amount", "method"] as const;
type SortColumn = (typeof SORTABLE_COLUMNS)[number];

function isSortColumn(value: string | undefined): value is SortColumn {
  return !!value && (SORTABLE_COLUMNS as readonly string[]).includes(value);
}

const COLUMNS: {
  key: SortColumn;
  label: string;
  hideBelow?: HideBelow;
}[] = [
  { key: "received_date", label: "Date", hideBelow: "sm" },
  { key: "amount", label: "Amount" },
  { key: "method", label: "Method", hideBelow: "lg" },
];

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export const metadata: Metadata = {
  title: "Donations",
};

export default async function FinanceDonationsPage({
  searchParams,
}: DonationsPageProps) {
  const supabase = await createSupabaseServerClient();

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const search = raw("search") || "";
  const eventFilter = raw("event") || "all";
  const donorFilter = raw("donor") === "anonymous" ? "anonymous" : "all";
  const methodRaw = raw("method");
  const methodFilter = isPaymentMethod(methodRaw) ? methodRaw : "all";

  const sortParam = raw("sort");
  const sort: SortColumn = isSortColumn(sortParam)
    ? sortParam
    : "received_date";
  const dir: "asc" | "desc" = raw("dir") === "asc" ? "asc" : "desc";

  const page = parsePage(raw("page"));
  const perPage = parsePerPage(raw("perPage"));

  let query = supabase
    .from("monetary_donations")
    .select(DONATION_COLUMNS, { count: "exact" })
    .order(sort, { ascending: dir === "asc" })
    .order("id", { ascending: true });

  if (search) {
    query = query.ilike("notes", `%${escapeLikePattern(search)}%`);
  }
  if (eventFilter === "none") {
    query = query.is("event_id", null);
  } else if (eventFilter !== "all") {
    query = query.eq("event_id", eventFilter);
  }
  if (donorFilter === "anonymous") {
    query = query.is("donor_id", null);
  }
  if (methodFilter !== "all") {
    query = query.eq("method", methodFilter);
  }

  const { offset, to } = pageRange(page, perPage);
  const [{ data: donations, count }, { data: events }, { data: people }] =
    await Promise.all([
      query.range(offset, to),
      supabase
        .from("events")
        .select("id, name")
        .order("name", { ascending: true }),
      supabase
        .from("people")
        .select("id, name, preferred_name, email, phone, auth_user_id")
        .order("name", { ascending: true }),
    ]);

  const donationRows = (donations ?? []) as unknown as MonetaryDonationRow[];
  const eventOptions = (events ?? []) as EventOption[];
  const peopleOptions = (people ?? []) as PersonListItem[];

  const filterParams = new URLSearchParams();
  if (search) filterParams.set("search", search);
  if (eventFilter !== "all") filterParams.set("event", eventFilter);
  if (donorFilter !== "all") filterParams.set("donor", donorFilter);
  if (methodFilter !== "all") filterParams.set("method", methodFilter);
  // On filterParams rather than in each href, so sorting and paging both
  // carry the reader's choice without either having to remember to.
  if (perPage !== PAGE_SIZE) filterParams.set("perPage", String(perPage));

  function sortHref(column: SortColumn) {
    const nextDir = sort === column && dir === "asc" ? "desc" : "asc";
    return buildHref("/portal/finance/donations", filterParams, {
      sort: column,
      dir: nextDir,
    });
  }

  function pageHref(nextPage: number) {
    return buildHref("/portal/finance/donations", filterParams, {
      sort,
      dir,
      page: nextPage,
    });
  }

  function perPageHref(nextPerPage: number) {
    // Back to page one: a bigger page renumbers them all, and page 4 of 9 is
    // nothing in particular once each page holds 25.
    return buildHref("/portal/finance/donations", filterParams, {
      sort,
      dir,
      perPage: nextPerPage,
      page: 1,
    });
  }

  const totalPages = totalPagesFor(count, perPage);
  const hasActiveFilters =
    !!search ||
    eventFilter !== "all" ||
    donorFilter !== "all" ||
    methodFilter !== "all";
  const activeFilterCount = [
    eventFilter !== "all",
    donorFilter !== "all",
    methodFilter !== "all",
  ].filter(Boolean).length;
  // Named in the toolbar rather than hidden behind the Filters count, so a
  // partially filtered table says why it's short.
  const appliedFilters: ActiveFilter[] = [];
  if (search) {
    appliedFilters.push({ param: "search", label: "Search", value: search });
  }
  if (eventFilter !== "all") {
    appliedFilters.push({
      param: "event",
      label: "Event",
      value:
        eventOptions.find((event) => event.id === eventFilter)?.name ??
        eventFilter,
    });
  }
  if (donorFilter !== "all") {
    appliedFilters.push({
      param: "donor",
      label: "Donor",
      value: "Anonymous",
    });
  }
  if (methodFilter !== "all") {
    appliedFilters.push({
      param: "method",
      label: "Method",
      value: paymentMethodLabel(methodFilter),
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Donations
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        <div className="flex items-center gap-2">
          <PageHelpContent title="How monetary donations work">
            <HowToSection heading="Steps">
              <ol className="list-decimal space-y-2 pl-4">
                <li>
                  Click{" "}
                  <strong className="text-foreground">New donation</strong> and
                  search for the donor by name or email — or create them inline
                  if it&apos;s their first gift.
                </li>
                <li>
                  Leave the donor empty to record an{" "}
                  <strong className="text-foreground">anonymous</strong>{" "}
                  donation.
                </li>
                <li>
                  Enter the amount, payment method, and date received; link an
                  event if the gift came in through one.
                </li>
              </ol>
            </HowToSection>
            <HowToSection heading="Who can do this">
              <p>
                <strong className="text-foreground">finance</strong> and{" "}
                <strong className="text-foreground">admin</strong> record and
                manage donations. Board members see the totals through Finance
                &gt; Reports only.
              </p>
            </HowToSection>
            <HowToSection heading="What happens downstream">
              <ul className="list-disc space-y-2 pl-4">
                <li>
                  Amounts roll into Finance &gt; Reports as cash income for the
                  period, separate from in-kind gear donations, which are
                  tracked under Inventory.
                </li>
                <li>
                  Every add, edit, or delete is written to the audit log,
                  including who acted and when.
                </li>
              </ul>
            </HowToSection>
            <HowToSection heading="Common mistakes">
              <ul className="list-disc space-y-2 pl-4">
                <li>
                  Recording donated gear here — physical items belong in
                  Inventory &gt; Donations so their value and movements are
                  tracked per item.
                </li>
                <li>
                  Recording event-day cash jars here — untracked onsite cash
                  collections are event revenue (source &quot;onsite
                  donations&quot;), not individual donor gifts.
                </li>
              </ul>
            </HowToSection>
          </PageHelpContent>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div className="rainbow-surface flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <SearchField
            action="/portal/finance/donations"
            defaultValue={search}
            placeholder="Search donor, notes..."
            preserve={{
              event: eventFilter,
              donor: donorFilter,
              method: methodFilter,
              sort,
              dir,
            }}
          />
          <FiltersSheet activeCount={activeFilterCount}>
            <form method="get" className="flex flex-col gap-4">
              <input type="hidden" name="sort" value={sort} />
              <input type="hidden" name="dir" value={dir} />

              {/* Search lives in the toolbar now; carry it through so
                  applying a filter here doesn't drop the current query. */}
              <input type="hidden" name="search" value={search} />

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="donor"
                  className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
                >
                  Donor
                </label>
                <select
                  id="donor"
                  name="donor"
                  defaultValue={donorFilter}
                  className={selectClassName}
                >
                  <option value="all">All donations</option>
                  <option value="anonymous">Anonymous only</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="method"
                  className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
                >
                  Payment method
                </label>
                <select
                  id="method"
                  name="method"
                  defaultValue={methodFilter}
                  className={selectClassName}
                >
                  <option value="all">All methods</option>
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {paymentMethodLabel(method)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="event"
                  className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
                >
                  Event
                </label>
                <select
                  id="event"
                  name="event"
                  defaultValue={eventFilter}
                  className={selectClassName}
                >
                  <option value="all">All donations</option>
                  <option value="none">No event</option>
                  {eventOptions.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <FilterSubmitButton />
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    nativeButton={false}
                    render={<Link href="/portal/finance/donations" />}
                  >
                    <LinkPendingPulse>Clear</LinkPendingPulse>
                  </Button>
                )}
              </div>
            </form>
          </FiltersSheet>

          <NewDonationDialog events={eventOptions} people={peopleOptions} />
        </div>

        <ActiveFilters
          action="/portal/finance/donations"
          filters={appliedFilters}
          params={{
            search,
            event: eventFilter,
            donor: donorFilter,
            method: methodFilter,
            sort,
            dir,
          }}
        />

        <Card>
          <CardContent className="px-0">
            {donationRows.length === 0 ? (
              hasActiveFilters ? (
                <EmptyState
                  title="No donations match your filters"
                  description="Clear or loosen the filters to see more."
                />
              ) : (
                <EmptyState
                  title="No donations recorded yet"
                  description="Record the first one with New donation above."
                />
              )
            ) : (
              <Table stickyFirstColumn stickyHeader="page">
                <TableHeader>
                  <TableRow>
                    <TableHead>Donor</TableHead>
                    {COLUMNS.map((column) => (
                      <TableHead
                        key={column.key}
                        hideBelow={column.hideBelow}
                        sortDirection={sort === column.key ? dir : null}
                      >
                        <SortHeaderLink
                          href={sortHref(column.key)}
                          label={column.label}
                          dir={sort === column.key ? dir : null}
                        />
                      </TableHead>
                    ))}
                    <TableHead hideBelow="md">Event</TableHead>
                    <TableHead className="w-0">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {donationRows.map((donation) => (
                    <TableRow key={donation.id}>
                      <TableCell className="whitespace-normal">
                        {donorLabel(donation)}
                      </TableCell>
                      <TableCell hideBelow="sm">
                        {formatCalendarDate(donation.received_date)}
                      </TableCell>
                      <TableCell>{formatCurrency(donation.amount)}</TableCell>
                      <TableCell hideBelow="lg">
                        <PaymentMethodBadge method={donation.method} />
                      </TableCell>
                      <TableCell hideBelow="md" className="app-muted">
                        {donation.events?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <EditDonationModal
                          donation={donation}
                          events={eventOptions}
                          people={peopleOptions}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {donationRows.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            count={count}
            pageSize={perPage}
            hrefFor={pageHref}
            perPageHrefFor={perPageHref}
          />
        )}
      </div>
    </>
  );
}
