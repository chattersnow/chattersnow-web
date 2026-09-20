import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FiltersSheet } from "@/components/filters-sheet";
import { FilterSubmitButton } from "@/components/filter-submit-button";
import { LinkPendingPulse } from "@/components/link-pending";
import { DELIVERY_STATUSES } from "@/lib/notifications/delivery-record";
import {
  activeDeliveryLogFilters,
  type DeliveryLogParams,
} from "./delivery-log-params";
import { DELIVERY_KIND_VALUES, deliveryKindLabel } from "./delivery-log-labels";

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const STATUS_LABELS: Record<string, string> = {
  pending: "Sending",
  sent: "Sent",
  failed: "Failed",
  skipped: "Not sent",
};

export function DeliveryLogFilterForm({
  filters,
}: {
  filters: DeliveryLogParams;
}) {
  const active = activeDeliveryLogFilters(filters);
  const activeFilterCount = active.filter(Boolean).length;

  // Alphabetical by what the reader sees, not by key: "Artwork submission
  // receipts" and "artwork_submission_confirmation" sort nowhere near each
  // other, and only one of them is on the screen.
  const kinds = [...DELIVERY_KIND_VALUES]
    .map((key) => ({ key, label: deliveryKindLabel(key) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="rainbow-surface mt-6 flex justify-end rounded-xl border border-[var(--line)] p-4 shadow-md">
      <FiltersSheet activeCount={activeFilterCount}>
        <form method="get" className="flex flex-col gap-4">
          <input type="hidden" name="sort" value={filters.sort} />
          <input type="hidden" name="dir" value={filters.dir} />

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
              defaultValue={filters.status}
              className={selectClassName}
            >
              <option value="all">Any status</option>
              {DELIVERY_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value] ?? value}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="kind"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Kind
            </label>
            <select
              id="kind"
              name="kind"
              defaultValue={filters.kind}
              className={selectClassName}
            >
              <option value="all">Every kind</option>
              {kinds.map((kind) => (
                <option key={kind.key} value={kind.key}>
                  {kind.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="recipient"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Recipient
            </label>
            <input
              id="recipient"
              name="recipient"
              type="search"
              placeholder="Name or email address"
              defaultValue={filters.recipient}
              className={selectClassName}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="record"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Record
            </label>
            <input
              id="record"
              name="record"
              type="search"
              placeholder="The id of a submission, application or request"
              defaultValue={filters.record}
              className={selectClassName}
            />
            <p className="app-muted text-xs">
              Every automatic send is keyed on the record that triggered it, so
              a record&rsquo;s id finds all the mail about it.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="from"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={filters.from}
              className={selectClassName}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="to"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={filters.to}
              className={selectClassName}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterSubmitButton />
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                nativeButton={false}
                render={<Link href="/portal/administration/delivery-log" />}
              >
                <LinkPendingPulse>Clear</LinkPendingPulse>
              </Button>
            )}
          </div>
        </form>
      </FiltersSheet>
    </div>
  );
}
