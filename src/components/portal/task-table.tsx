"use client";

import { ReactNode, useMemo, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { StatusBadge } from "@/components/portal/status-badge";
import { formatCalendarDate, personDisplayName } from "@/lib/format";
import {
  DEFAULT_TASK_FILTERS,
  isTaskOverdue,
  serializeTaskFilters,
  taskFilterParamName,
  TASK_DUE_FILTER_LABELS,
  TASK_STATUS_FILTER_LABELS,
  type TaskDueFilter,
  type TaskFilters,
  type TaskOwner,
  type TaskRow,
  type TaskStatusFilter,
} from "@/lib/portal/task-list";

/**
 * The one table every module-level task list renders (#1643, #1658): item,
 * type, owner, due date, status and source, with the shared filter bar above
 * it. The filters live in the URL, so a link or a reload opens the same list,
 * and the page re-queries on the server when they move.
 *
 * Each module supplies what only it knows: its kind labels, and the inline
 * controls for a row the viewer may edit (`renderStatus`, `renderActions`).
 * A row with `canEdit` false gets the plain status badge and no actions.
 * A list of a single kind (Meetings' Action items view, #1659) drops the
 * Type filter and column, which could only ever say one thing.
 */
export function TaskTable<R extends TaskRow>({
  rows,
  filters,
  owners,
  today,
  kindLabels,
  renderStatus,
  renderActions,
  emptyMessage = "Nothing matches these filters.",
  paramPrefix,
  showStatusFilter,
}: {
  /** Already filtered and sorted, overdue first. */
  rows: readonly R[];
  filters: TaskFilters;
  owners: readonly TaskOwner[];
  /** The organization's day, "YYYY-MM-DD", that "overdue" is measured from. */
  today: string;
  kindLabels: Record<string, string>;
  renderStatus?: (row: R) => ReactNode;
  renderActions?: (row: R) => ReactNode;
  emptyMessage?: string;
  /** See `taskFilterParamName`. */
  paramPrefix?: string;
  showStatusFilter?: boolean;
}) {
  const singleKind = Object.keys(kindLabels).length <= 1;

  const columns = useMemo<PortalDataTableColumn<R>[]>(
    () => [
      {
        key: "title",
        label: "Item",
        sortValue: (row) => row.title,
        cellClassName: "max-w-xs font-medium",
        render: (row) => (
          <span className="line-clamp-2" title={row.title}>
            {row.title}
          </span>
        ),
      },
      ...(singleKind
        ? []
        : ([
            {
              key: "kind",
              label: "Type",
              hideBelow: "md",
              sortValue: (row) => kindLabels[row.kind] ?? row.kind,
              cellClassName: "app-muted",
              render: (row) => kindLabels[row.kind] ?? row.kind,
            },
          ] satisfies PortalDataTableColumn<R>[])),
      {
        key: "owner",
        label: "Owner",
        hideBelow: "lg",
        sortValue: (row) => personDisplayName(row.owner, ""),
        cellClassName: "app-muted",
        render: (row) => personDisplayName(row.owner, "Unassigned"),
      },
      {
        key: "dueDate",
        label: "Due date",
        sortValue: (row) => row.dueDate,
        render: (row) => (
          <span className="flex flex-wrap items-center gap-2">
            <span className="app-muted">
              {formatCalendarDate(row.dueDate, "No due date")}
            </span>
            {isTaskOverdue(row, today) ? (
              <StatusBadge tone="warning">Overdue</StatusBadge>
            ) : null}
          </span>
        ),
      },
      {
        key: "status",
        label: "Status",
        sortValue: (row) => row.statusLabel,
        render: (row) =>
          row.canEdit && renderStatus ? (
            renderStatus(row)
          ) : (
            <StatusBadge tone={row.isDone ? "success" : "neutral"}>
              {row.statusLabel}
            </StatusBadge>
          ),
      },
      {
        key: "source",
        label: "Source",
        hideBelow: "lg",
        sortValue: (row) => row.source.label,
        render: (row) => (
          <Link
            href={row.source.href}
            className="underline-offset-4 hover:underline"
          >
            {row.source.label}
          </Link>
        ),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (row) =>
          row.canEdit && renderActions ? renderActions(row) : null,
      },
    ],
    [kindLabels, renderActions, renderStatus, singleKind, today],
  );

  return (
    <div className="space-y-4">
      <div className="rainbow-surface rounded-xl border border-[var(--line)] p-4 shadow-md">
        <TaskFilterBar
          filters={filters}
          owners={owners}
          kindLabels={singleKind ? undefined : kindLabels}
          paramPrefix={paramPrefix}
          showStatus={showStatusFilter}
        />
      </div>

      <PortalDataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.key}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}

/**
 * The shared filter selects -- owner (with Mine and Unassigned), type, due
 * and status -- writing to the URL. A field is offered only when its prop
 * is: no `kindLabels` means no Type select, and `showStatus={false}` is for
 * a page that lists every status itself (#1659's checklists). Params the
 * filters don't own, such as a tab, are kept. `paramPrefix` renames the
 * filters' own params (see `taskFilterParamName`).
 */
export function TaskFilterBar({
  filters,
  owners,
  kindLabels,
  showStatus = true,
  paramPrefix = "",
}: {
  filters: TaskFilters;
  owners: readonly TaskOwner[];
  kindLabels?: Record<string, string>;
  showStatus?: boolean;
  paramPrefix?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function setFilter<K extends keyof TaskFilters>(
    key: K,
    value: TaskFilters[K],
  ) {
    const params = new URLSearchParams(searchParams.toString());
    for (const name of Object.keys(DEFAULT_TASK_FILTERS)) {
      params.delete(
        taskFilterParamName(name as keyof TaskFilters, paramPrefix),
      );
    }
    for (const [name, next] of new URLSearchParams(
      serializeTaskFilters({ ...filters, [key]: value }, paramPrefix),
    )) {
      params.set(name, next);
    }
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    });
  }

  const ownerIsListed =
    ["all", "mine", "unassigned"].includes(filters.owner) ||
    owners.some((owner) => owner.id === filters.owner);

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={isPending}>
      <FilterSelect
        label="Owner"
        value={filters.owner}
        onChange={(value) => setFilter("owner", value)}
      >
        <SelectItem value="all">Anyone</SelectItem>
        <SelectItem value="mine">Mine</SelectItem>
        <SelectItem value="unassigned">Unassigned</SelectItem>
        {owners.map((owner) => (
          <SelectItem key={owner.id} value={owner.id}>
            {personDisplayName(owner)}
          </SelectItem>
        ))}
        {ownerIsListed ? null : (
          // A link to someone who no longer owns anything at this status.
          <SelectItem value={filters.owner}>Someone else</SelectItem>
        )}
      </FilterSelect>

      {kindLabels ? (
        <FilterSelect
          label="Type"
          value={filters.type}
          onChange={(value) => setFilter("type", value)}
        >
          <SelectItem value="all">All types</SelectItem>
          {Object.entries(kindLabels).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </FilterSelect>
      ) : null}

      <FilterSelect
        label="Due"
        value={filters.due}
        onChange={(value) => setFilter("due", value as TaskDueFilter)}
      >
        {Object.entries(TASK_DUE_FILTER_LABELS).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </FilterSelect>

      {showStatus ? (
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(value) => setFilter("status", value as TaskStatusFilter)}
        >
          {Object.entries(TASK_STATUS_FILTER_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </FilterSelect>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
        {label}
      </span>
      <Select
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(next);
        }}
      >
        <SelectTrigger aria-label={`Filter by ${label.toLowerCase()}`}>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}
