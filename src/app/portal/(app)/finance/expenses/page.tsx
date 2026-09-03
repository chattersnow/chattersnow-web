import { humanizeStatus } from "@/components/portal/status-badge";
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
  pageRange,
  parsePage,
  totalPagesFor,
} from "@/lib/pagination";
import { EditExpenseModal } from "./edit-expense-modal";
import { ExpenseStatusBadge } from "./expense-badges";
import { NewExpenseDialog } from "./new-expense-dialog";
import {
  EXPENSE_COLUMNS,
  formatAmount,
  getExpenseApprovalContext,
  isExpenseStatus,
  type EventOption,
  type ExpenseRow,
  type ExpenseStatus,
} from "./expenses-shared";
import { formatCalendarDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

type ExpensesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SORTABLE_COLUMNS = ["description", "expense_date", "amount"] as const;
type SortColumn = (typeof SORTABLE_COLUMNS)[number];

function isSortColumn(value: string | undefined): value is SortColumn {
  return !!value && (SORTABLE_COLUMNS as readonly string[]).includes(value);
}

const STATUS_OPTIONS: ExpenseStatus[] = [
  "submitted",
  "approved",
  "rejected",
  "paid",
];

const COLUMNS: {
  key: SortColumn;
  label: string;
  hideBelow?: HideBelow;
}[] = [
  { key: "description", label: "Description" },
  { key: "expense_date", label: "Date", hideBelow: "sm" },
  { key: "amount", label: "Amount" },
];

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export const metadata: Metadata = {
  title: "Finance",
};

export default async function ExpensesPage({
  searchParams,
}: ExpensesPageProps) {
  const supabase = await createSupabaseServerClient();

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const search = raw("search") || "";
  const eventFilter = raw("event") || "all";
  const statusRaw = raw("status");
  const statusFilter = isExpenseStatus(statusRaw) ? statusRaw : "all";

  const sortParam = raw("sort");
  const sort: SortColumn = isSortColumn(sortParam) ? sortParam : "expense_date";
  const dir: "asc" | "desc" = raw("dir") === "asc" ? "asc" : "desc";

  const page = parsePage(raw("page"));

  let query = supabase
    .from("event_expenses")
    .select(EXPENSE_COLUMNS, { count: "exact" })
    .order(sort, { ascending: dir === "asc" })
    .order("id", { ascending: true });

  if (search) {
    query = query.ilike("description", `%${escapeLikePattern(search)}%`);
  }
  if (eventFilter === "none") {
    query = query.is("event_id", null);
  } else if (eventFilter !== "all") {
    query = query.eq("event_id", eventFilter);
  }
  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { offset, to } = pageRange(page);
  const [{ data: expenses, count }, { data: events }, approvalContext] =
    await Promise.all([
      query.range(offset, to),
      supabase
        .from("events")
        .select("id, name")
        .order("name", { ascending: true }),
      getExpenseApprovalContext(supabase),
    ]);

  const expenseRows = (expenses ?? []) as unknown as ExpenseRow[];
  const eventOptions = (events ?? []) as EventOption[];

  const filterParams = new URLSearchParams();
  if (search) filterParams.set("search", search);
  if (eventFilter !== "all") filterParams.set("event", eventFilter);
  if (statusFilter !== "all") filterParams.set("status", statusFilter);

  function sortHref(column: SortColumn) {
    const nextDir = sort === column && dir === "asc" ? "desc" : "asc";
    return buildHref("/portal/finance/expenses", filterParams, {
      sort: column,
      dir: nextDir,
    });
  }

  function pageHref(nextPage: number) {
    return buildHref("/portal/finance/expenses", filterParams, {
      sort,
      dir,
      page: nextPage,
    });
  }

  const totalPages = totalPagesFor(count);
  const hasActiveFilters =
    !!search || eventFilter !== "all" || statusFilter !== "all";
  const activeFilterCount = [
    eventFilter !== "all",
    statusFilter !== "all",
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
  if (statusFilter !== "all") {
    appliedFilters.push({
      param: "status",
      label: "Status",
      value: humanizeStatus(statusFilter),
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Expenses
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        <div className="flex items-center gap-2">
          <PageHelpContent title="How expense approval works">
            <HowToSection heading="Steps">
              <ol className="list-decimal space-y-2 pl-4">
                <li>
                  <strong className="text-foreground">Submitted</strong> —
                  finance or an event coordinator records an expense. Every
                  expense starts here.
                </li>
                <li>
                  <strong className="text-foreground">
                    Approved or rejected
                  </strong>{" "}
                  —
                  {approvalContext.threshold !== null ? (
                    <>
                      {" "}
                      below {formatAmount(approvalContext.threshold, "USD")},
                      finance can approve their own submission. At or above
                      that, an admin or board member — someone other than
                      whoever submitted it — has to approve or reject it.
                    </>
                  ) : (
                    <>
                      {" "}
                      an admin or board member, other than whoever submitted it,
                      approves or rejects it.
                    </>
                  )}
                </li>
                <li>
                  <strong className="text-foreground">Paid</strong> — once
                  approved, finance or admin marks it as paid after payment has
                  actually been sent.
                </li>
              </ol>
            </HowToSection>
            <HowToSection heading="Who can do this">
              <p>
                <strong className="text-foreground">finance</strong> (and{" "}
                <strong className="text-foreground">event_coordinator</strong>{" "}
                for event-level expenses) records; below the threshold, finance
                can approve their own; at or above it, an{" "}
                <strong className="text-foreground">admin</strong> or{" "}
                <strong className="text-foreground">board</strong> member other
                than the submitter approves or rejects.
              </p>
            </HowToSection>
            <HowToSection heading="What happens downstream">
              <ul className="list-disc space-y-2 pl-4">
                <li>
                  The threshold is a setting, not a fixed rule — admin or board
                  can change it anytime in{" "}
                  <Link
                    href="/portal/administration/system-settings"
                    className="underline hover:text-foreground"
                  >
                    Administration &gt; System Settings
                  </Link>
                  , and it takes effect here immediately, without a code change.
                </li>
                <li>
                  Every submit, approve, reject, or paid transition is written
                  to the audit log, including who acted and when.
                </li>
                <li>
                  RLS blocks a submitter from approving their own submission at
                  the database level too, not just in the UI.
                </li>
              </ul>
            </HowToSection>
            <HowToSection heading="Common mistakes">
              <ul className="list-disc space-y-2 pl-4">
                <li>
                  Submitting an expense without a receipt link — nothing blocks
                  it, but it slows the approver down since there&apos;s no
                  upload, only a link field.
                </li>
                <li>
                  Trying to approve your own submission when it&apos;s at or
                  above the threshold — the action is rejected even for an admin
                  account if they&apos;re the submitter.
                </li>
              </ul>
            </HowToSection>
          </PageHelpContent>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div className="rainbow-surface flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <SearchField
            action="/portal/finance/expenses"
            defaultValue={search}
            placeholder="Search vendor, notes..."
            preserve={{ event: eventFilter, status: statusFilter, sort, dir }}
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
                  <option value="all">All expenses</option>
                  <option value="none">No event</option>
                  {eventOptions.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="status"
                  className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
                >
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  defaultValue={statusFilter}
                  className={selectClassName}
                >
                  <option value="all">All statuses</option>
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status} className="capitalize">
                      {status}
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
                    render={<Link href="/portal/finance/expenses" />}
                  >
                    <LinkPendingPulse>Clear</LinkPendingPulse>
                  </Button>
                )}
              </div>
            </form>
          </FiltersSheet>

          <NewExpenseDialog events={eventOptions} />
        </div>

        <ActiveFilters
          action="/portal/finance/expenses"
          filters={appliedFilters}
          params={{
            search,
            event: eventFilter,
            status: statusFilter,
            sort,
            dir,
          }}
        />

        <Card>
          <CardContent className="px-0">
            {expenseRows.length === 0 ? (
              hasActiveFilters ? (
                <EmptyState
                  title="No expenses match your filters"
                  description="Clear or loosen the filters to see more."
                />
              ) : (
                <EmptyState
                  title="No expenses recorded yet"
                  description="Record the first one with New Expense above."
                />
              )
            ) : (
              <Table stickyFirstColumn>
                <TableHeader>
                  <TableRow>
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
                    <TableHead>Status</TableHead>
                    <TableHead className="w-0">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenseRows.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="whitespace-normal">
                        {expense.description}
                      </TableCell>
                      <TableCell hideBelow="sm">
                        {formatCalendarDate(expense.expense_date)}
                      </TableCell>
                      <TableCell>
                        {formatAmount(expense.amount, expense.currency)}
                      </TableCell>
                      <TableCell hideBelow="md" className="app-muted">
                        {expense.events?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <ExpenseStatusBadge status={expense.status} />
                      </TableCell>
                      <TableCell>
                        <EditExpenseModal
                          expense={expense}
                          events={eventOptions}
                          approvalContext={approvalContext}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {expenseRows.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            count={count}
            hrefFor={pageHref}
          />
        )}
      </div>
    </>
  );
}
