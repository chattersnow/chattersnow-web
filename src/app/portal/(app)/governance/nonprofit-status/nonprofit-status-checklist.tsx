"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { EditMilestoneModal } from "./edit-milestone-modal";
import { NewMilestoneDialog } from "./new-milestone-dialog";
import { MilestoneStatusBadge } from "./nonprofit-status-badges";
import {
  updateMilestoneStatusAction,
  type Milestone,
} from "./nonprofit-status-actions";
import type { MilestoneStatus } from "./nonprofit-status-form";
import type { PersonListItem } from "../../people/actions";
import { Spinner } from "@/components/ui/spinner";

// The Phase 1-5 checklist from supabase/migrations/20260824210000_create_nonprofit_status_milestones.sql,
// in migration order. `milestones` already arrives sorted by `sort_order`
// (see page.tsx's query), which keeps rows stable within a phase; this array
// pins the phase *group* (card) order, since `sort_order` only orders within
// a group, not across phases.
const PHASE_ORDER = [
  "Phase 1 — Now (founding/legal package)",
  "Phase 2 — Incorporation (NJ)",
  "Phase 3 — Federal (501(c)(3))",
  "Phase 4 — State fundraising registration (NJ)",
  "Phase 4 — State fundraising registration (NY)",
  "Phase 5 — Fundraising infrastructure",
];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(value: string | null) {
  if (!value) return "—";
  return dateFormatter.format(new Date(value));
}

function groupByPhase(milestones: Milestone[]) {
  const groups = new Map<string, Milestone[]>();
  for (const milestone of milestones) {
    const existing = groups.get(milestone.phase);
    if (existing) {
      existing.push(milestone);
    } else {
      groups.set(milestone.phase, [milestone]);
    }
  }
  return [...groups.entries()].sort(([a], [b]) => {
    const rankA = PHASE_ORDER.indexOf(a);
    const rankB = PHASE_ORDER.indexOf(b);
    if (rankA === -1 && rankB === -1) return a.localeCompare(b);
    if (rankA === -1) return 1;
    if (rankB === -1) return -1;
    return rankA - rankB;
  });
}

function MilestoneStatusSelect({ milestone }: { milestone: Milestone }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: MilestoneStatus | null) {
    if (!value) return;
    startTransition(async () => {
      await updateMilestoneStatusAction(milestone.id, value);
      router.refresh();
    });
  }

  return (
    <Select
      value={milestone.status}
      onValueChange={handleChange}
      disabled={isPending}
    >
      <SelectTrigger
        className="h-8 w-40"
        aria-label={`Status for ${milestone.description}`}
      >
        {isPending ? <Spinner /> : null}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="not_started">Not started</SelectItem>
        <SelectItem value="in_progress">In progress</SelectItem>
        <SelectItem value="done">Done</SelectItem>
        <SelectItem value="cancelled">Cancelled</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function NonprofitStatusChecklist({
  milestones,
  people,
  canManage,
}: {
  milestones: Milestone[];
  people: PersonListItem[];
  canManage: boolean;
}) {
  const completeCount = useMemo(
    () => milestones.filter((m) => m.status === "done").length,
    [milestones],
  );
  const phaseGroups = useMemo(() => groupByPhase(milestones), [milestones]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="app-muted text-sm">
          {completeCount} of {milestones.length} complete
        </p>
        {canManage && (
          <NewMilestoneDialog people={people} existingPhases={PHASE_ORDER} />
        )}
      </div>

      {phaseGroups.length === 0 ? (
        <Card>
          <CardContent className="px-0">
            <p className="app-muted px-4 py-6 text-sm">
              No milestones recorded yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        phaseGroups.map(([phase, items]) => {
          const phaseComplete = items.filter((m) => m.status === "done").length;
          return (
            <Card key={phase}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>{phase}</span>
                  <span className="app-muted text-xs font-normal">
                    {phaseComplete} of {items.length} complete
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Due date</TableHead>
                      <TableHead className="w-0">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((milestone) => (
                      <TableRow key={milestone.id}>
                        <TableCell>
                          {canManage ? (
                            <MilestoneStatusSelect milestone={milestone} />
                          ) : (
                            <MilestoneStatusBadge status={milestone.status} />
                          )}
                        </TableCell>
                        <TableCell className="max-w-md whitespace-normal">
                          {milestone.description}
                        </TableCell>
                        <TableCell className="app-muted">
                          {milestone.owner?.name ?? "—"}
                        </TableCell>
                        <TableCell className="app-muted">
                          {formatDate(milestone.due_date)}
                        </TableCell>
                        <TableCell>
                          {canManage && (
                            <EditMilestoneModal
                              milestone={milestone}
                              people={people}
                              existingPhases={PHASE_ORDER}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
