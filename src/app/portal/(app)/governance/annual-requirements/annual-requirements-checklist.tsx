"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function RequirementStatusSelect({
  requirement,
}: {
  requirement: AnnualRequirement;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: RequirementStatus | null) {
    if (!value) return;
    startTransition(async () => {
      await updateAnnualRequirementStatusAction(requirement.id, value);
      router.refresh();
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
            <p className="app-muted px-4 py-6 text-sm">
              No annual requirements recorded yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Responsible</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requirements.map((requirement) => (
                  <TableRow key={requirement.id}>
                    <TableCell>
                      {canManage ? (
                        <RequirementStatusSelect requirement={requirement} />
                      ) : (
                        <RequirementStatusBadge status={requirement.status} />
                      )}
                    </TableCell>
                    <TableCell className="max-w-md font-medium">
                      {requirement.name}
                    </TableCell>
                    <TableCell className="app-muted">
                      {formatCalendarDate(requirement.due_date)}
                    </TableCell>
                    <TableCell className="app-muted">
                      {personDisplayName(requirement.responsible)}
                    </TableCell>
                    <TableCell>
                      {canManage && (
                        <EditRequirementModal
                          requirement={requirement}
                          people={people}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
