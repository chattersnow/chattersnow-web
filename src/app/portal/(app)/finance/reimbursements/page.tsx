import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HowToSection } from "@/components/how-to-section";
import { PageHelpContent } from "../../help/help-context";
import { FiltersSheet } from "@/components/filters-sheet";
import {
  buildHref,
  escapeLikePattern,
  pageRange,
  parsePage,
  totalPagesFor,
} from "@/lib/pagination";
import { EditReimbursementModal } from "./edit-reimbursement-modal";
import { ReimbursementStatusBadge } from "./reimbursement-badges";
import { NewReimbursementDialog } from "./new-reimbursement-dialog";
import {
  REIMBURSEMENT_COLUMNS,
  formatAmount,
  formatReimbursementDate,
  getReimbursementApprovalContext,
  isReimbursementStatus,
  type EventOption,
  type ReimbursementRow,
  type ReimbursementStatus,
} from "./reimbursements-shared";
import type { PersonListItem } from "../../people/actions";

type ReimbursementsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SORTABLE_COLUMNS = ["description", "created_at", "amount"] as const;
type SortColumn = (typeof SORTABLE_COLUMNS)[number];

function isSortColumn(value: string | undefined): value is SortColumn {
  return !!value && (SORTABLE_COLUMNS as readonly string[]).includes(value);
}

const STATUS_OPTIONS: ReimbursementStatus[] = [
  "submitted",
  "approved",
  "rejected",
  "paid",
];

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "description", label: "Description" },
  { key: "created_at", label: "Submitted" },
  { key: "amount", label: "Amount" },
];

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export default async function ReimbursementsPage({
  searchParams,
}: ReimbursementsPageProps) {
  const supabase = await createSupabaseServerClient();

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const search = raw("search") || "";
  const eventFilter = raw("event") || "all";
  const statusRaw = raw("status");
  const statusFilter = isReimbursementStatus(statusRaw) ? statusRaw : "all";

  const sortParam = raw("sort");
  const sort: SortColumn = isSortColumn(sortParam) ? sortParam : "created_at";
  const dir: "asc" | "desc" = raw("dir") === "asc" ? "asc" : "desc";

  const page = parsePage(raw("page"));

  let query = supabase
    .from("reimbursements")
    .select(REIMBURSEMENT_COLUMNS, { count: "exact" })
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
  const [
    { data: reimbursements, count },
    { data: people },
    { data: events },
    approvalContext,
  ] = await Promise.all([
    query.range(offset, to),
    supabase
      .from("people")
      .select("id, name, email, phone, is_sponsor")
      .order("name", { ascending: true }),
    supabase
      .from("events")
      .select("id, name")
      .order("name", { ascending: true }),
    getReimbursementApprovalContext(supabase),
  ]);

  const reimbursementRows = (reimbursements ??
    []) as unknown as ReimbursementRow[];
  const peopleOptions = (people ?? []) as PersonListItem[];
  const eventOptions = (events ?? []) as EventOption[];

  const filterParams = new URLSearchParams();
  if (search) filterParams.set("search", search);
  if (eventFilter !== "all") filterParams.set("event", eventFilter);
  if (statusFilter !== "all") filterParams.set("status", statusFilter);

  function sortHref(column: SortColumn) {
    const nextDir = sort === column && dir === "asc" ? "desc" : "asc";
    return buildHref("/portal/finance/reimbursements", filterParams, {
      sort: column,
      dir: nextDir,
    });
  }

  function pageHref(nextPage: number) {
    return buildHref("/portal/finance/reimbursements", filterParams, {
      sort,
      dir,
      page: nextPage,
    });
  }

  function SortIcon({ column }: { column: SortColumn }) {
    if (sort !== column) {
      return <ArrowUpDown className="size-3.5 text-muted-foreground" />;
    }
    return dir === "asc" ? (
      <ArrowUp className="size-3.5" />
    ) : (
      <ArrowDown className="size-3.5" />
    );
  }

  const totalPages = totalPagesFor(count);
  const hasActiveFilters =
    !!search || eventFilter !== "all" || statusFilter !== "all";
  const activeFilterCount = [
    !!search,
    eventFilter !== "all",
    statusFilter !== "all",
  ].filter(Boolean).length;

  return (
    <>
      <div className="rainbow-accent w-16" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Reimbursements
        </h1>
        <div className="flex items-center gap-2">
          <PageHelpContent title="How reimbursement approval works">
            <HowToSection heading="Steps">
              <ol className="list-decimal space-y-2 pl-4">
                <li>
                  <strong className="text-foreground">Submitted</strong> —
                  finance, an event coordinator, or admin records a
                  reimbursement request on behalf of the person who spent the
                  money. Every reimbursement starts here.
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
                <strong className="text-foreground">finance</strong>, an{" "}
                <strong className="text-foreground">event_coordinator</strong>,
                or <strong className="text-foreground">admin</strong> can submit
                on someone&apos;s behalf; approval mirrors expenses — finance
                self-approves below the threshold, admin or board approve at or
                above it.
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
                  Reimbursements use their own threshold, separate from the
                  expense threshold.
                </li>
                <li>
                  Every submit, approve, reject, or paid transition is written
                  to the audit log, including who acted and when.
                </li>
              </ul>
            </HowToSection>
            <HowToSection heading="Common mistakes">
              <ul className="list-disc space-y-2 pl-4">
                <li>
                  Recording under the wrong person — the reimbursement tracks
                  the requesting person separately from whoever enters the
                  record, so double-check the Requester field.
                </li>
                <li>
                  Resubmitting a new request instead of editing an
                  already-submitted one creates a duplicate rather than
                  correcting it.
                </li>
              </ul>
            </HowToSection>
          </PageHelpContent>
          <NewReimbursementDialog
            people={peopleOptions}
            events={eventOptions}
          />
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div className="rainbow-surface flex justify-end rounded-xl border border-[var(--line)] p-4 shadow-md">
          <FiltersSheet activeCount={activeFilterCount}>
            <form method="get" className="flex flex-col gap-4">
              <input type="hidden" name="sort" value={sort} />
              <input type="hidden" name="dir" value={dir} />

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="search"
                  className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
                >
                  Search
                </label>
                <Input
                  id="search"
                  name="search"
                  placeholder="Search description..."
                  defaultValue={search}
                />
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
                  <option value="all">All reimbursements</option>
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
                <Button type="submit" variant="secondary">
                  Filter
                </Button>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    nativeButton={false}
                    render={<Link href="/portal/finance/reimbursements" />}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </form>
          </FiltersSheet>
        </div>

        <Card>
          <CardContent className="px-0">
            {reimbursementRows.length === 0 ? (
              <p className="app-muted px-4 py-6 text-sm">
                {hasActiveFilters
                  ? "No reimbursements match your filters."
                  : "No reimbursements recorded yet."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {COLUMNS.map((column) => (
                      <TableHead key={column.key}>
                        <Link
                          href={sortHref(column.key)}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          {column.label}
                          <SortIcon column={column.key} />
                        </Link>
                      </TableHead>
                    ))}
                    <TableHead>Requester</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-0">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reimbursementRows.map((reimbursement) => (
                    <TableRow key={reimbursement.id}>
                      <TableCell className="whitespace-normal">
                        {reimbursement.description}
                      </TableCell>
                      <TableCell>
                        {formatReimbursementDate(reimbursement.created_at)}
                      </TableCell>
                      <TableCell>
                        {formatAmount(
                          reimbursement.amount,
                          reimbursement.currency,
                        )}
                      </TableCell>
                      <TableCell className="app-muted">
                        {reimbursement.people?.name ?? "—"}
                      </TableCell>
                      <TableCell className="app-muted">
                        {reimbursement.events?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <ReimbursementStatusBadge
                          status={reimbursement.status}
                        />
                      </TableCell>
                      <TableCell>
                        <EditReimbursementModal
                          reimbursement={reimbursement}
                          people={peopleOptions}
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

        {reimbursementRows.length > 0 && (
          <Pagination page={page} totalPages={totalPages} hrefFor={pageHref} />
        )}
      </div>
    </>
  );
}
