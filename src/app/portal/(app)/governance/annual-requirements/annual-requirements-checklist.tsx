"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditRequirementModal } from "./edit-requirement-modal";
import { NewRequirementDialog } from "./new-requirement-dialog";
import { RequirementStatusBadge } from "./annual-requirements-badges";
import {
  updateAnnualRequirementStatusAction,
  type AnnualRequirement,
  type RequirementStatus,
} from "./annual-requirements-actions";
import type { PersonListItem } from "../../people/actions";
import { Spinner } from "@/components/ui/spinner";
import { formatCalendarDate, personDisplayName } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import { useActionToast } from "@/components/portal/action-toast";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";

const STATUS_LABELS: Record<RequirementStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

/**
 * Where each status sits in the work, not in the alphabet: sorting a
 * checklist on Status is a way of asking what is still outstanding, so
 * ascending has to put the untouched requirements first and the finished ones
 * last.
 */
const STATUS_RANK: Record<RequirementStatus, number> = {
  not_started: 0,
  in_progress: 1,
  done: 2,
};

function RequirementStatusSelect({
  requirement,
}: {
  requirement: AnnualRequirement;
}) {
  const router = useRouter();
  const { isPending, run } = useActionToast();

  function handleChange(value: RequirementStatus | null) {
    if (!value) return;
    run(() => updateAnnualRequirementStatusAction(requirement.id, value), {
      success: `${requirement.name} — ${STATUS_LABELS[value]}.`,
      error: "Could not update the requirement. Please try again.",
      onSuccess: () => router.refresh(),
    });
  }

  return (
    <Select
      value={requirement.status}
      onValueChange={handleChange}
      disabled={isPending}
    >
      <SelectTrigger
        className="h-8 w-40"
        aria-label={`Status for ${requirement.name}`}
      >
        {isPending ? <Spinner /> : null}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="not_started">Not started</SelectItem>
        <SelectItem value="in_progress">In progress</SelectItem>
        <SelectItem value="done">Done</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function AnnualRequirementsChecklist({
  requirements,
  people,
  canManage,
}: {
  requirements: AnnualRequirement[];
  people: PersonListItem[];
  canManage: boolean;
}) {
  const completeCount = useMemo(
    () => requirements.filter((r) => r.status === "done").length,
    [requirements],
  );

  const columns = useMemo<PortalDataTableColumn<AnnualRequirement>[]>(
    () => [
      {
        key: "status",
        label: "Status",
        sortValue: (requirement) => STATUS_RANK[requirement.status],
        render: (requirement) =>
          canManage ? (
            <RequirementStatusSelect requirement={requirement} />
          ) : (
            <RequirementStatusBadge status={requirement.status} />
          ),
      },
      {
        key: "name",
        label: "Name",
        sortValue: (requirement) => requirement.name,
        cellClassName: "max-w-md font-medium",
        render: (requirement) => requirement.name,
      },
      {
        key: "due_date",
        label: "Due date",
        sortValue: (requirement) => requirement.due_date,
        cellClassName: "app-muted",
        render: (requirement) => formatCalendarDate(requirement.due_date),
      },
      {
        key: "responsible",
        label: "Responsible",
        sortValue: (requirement) => personDisplayName(requirement.responsible),
        cellClassName: "app-muted",
        render: (requirement) => personDisplayName(requirement.responsible),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (requirement) =>
          canManage ? (
            <EditRequirementModal requirement={requirement} people={people} />
          ) : null,
      },
    ],
    [canManage, people],
  );

  return (
    <div className="space-y-4">
      <div className="rainbow-surface flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <p className="app-muted text-sm">
          {completeCount} of {requirements.length} complete
        </p>
        {canManage && <NewRequirementDialog people={people} />}
      </div>

      {requirements.length === 0 ? (
        <Card>
          <CardContent className="px-0">
            <EmptyState
              title="No annual requirements recorded yet"
              description={
                canManage
                  ? "Add the first one with Add requirement above."
                  : "Requirements appear here once a governance manager adds them."
              }
            />
          </CardContent>
        </Card>
      ) : (
        // A checklist, but not an order-intrinsic one: nothing about a
        // requirement's position carries meaning, and "what is due next" and
        // "what is still not started" are exactly the questions a reader
        // brings to it -- so it sorts and pages like every other list.
        <PortalDataTable
          columns={columns}
          rows={requirements}
          getRowKey={(requirement) => requirement.id}
          // The query orders by due date, soonest first.
          defaultSort={{ key: "due_date", dir: "asc" }}
          emptyMessage="No annual requirements to show."
        />
      )}
    </div>
  );
}
