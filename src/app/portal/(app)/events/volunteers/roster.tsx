"use client";

import { Fragment, useId, useMemo, useState } from "react";
import { ChevronDown, Clock } from "lucide-react";
import {
  type EventVolunteer,
  type EventVolunteerHours,
  type EventVolunteerPerson,
} from "../volunteers-actions";
import { type EventShift } from "../shifts-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatShiftRange, NONE_VALUE } from "./shifts";
import { AddVolunteerDialog } from "./add-volunteer-dialog";
import { LogHoursDialog } from "./log-hours-dialog";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { EmptyState } from "@/components/portal/empty-state";
import {
  LIST_PREVIEW_ROWS,
  ListPreviewSheet,
} from "@/components/portal/list-preview-sheet";
import { formatCalendarDate, personDisplayName } from "@/lib/format";
import { cn } from "@/lib/utils";

export type RosterRow = {
  personId: string;
  person: EventVolunteerPerson;
  /** Null when the ledger has hours for someone who never signed up. */
  signup: EventVolunteer | null;
  entries: EventVolunteerHours[];
  totalHours: number;
};

function sumHours(entries: EventVolunteerHours[]) {
  const total = entries.reduce((sum, entry) => sum + Number(entry.hours), 0);
  return Math.round(total * 100) / 100;
}

/**
 * Signups left-joined to the hours ledger by person, plus the people the
 * ledger carries who never signed up.
 *
 * The tab used to show these as two stacked tables listing overlapping names,
 * so answering "how many hours has this volunteer logged?" meant holding a
 * name from one table while scanning the other.
 *
 * `listEventVolunteerHoursAction` reads the shared `volunteer_hours` ledger,
 * which Volunteers > Participation also writes to without requiring a signup,
 * so hours-only people are expected rather than an anomaly. They are sorted
 * into the same alphabetical list and marked, rather than pushed to the end,
 * so the roster reads as one roster.
 */
export function buildRoster(
  volunteers: EventVolunteer[],
  hours: EventVolunteerHours[],
): RosterRow[] {
  const entriesByPerson = new Map<string, EventVolunteerHours[]>();
  for (const entry of hours) {
    const existing = entriesByPerson.get(entry.person_id);
    if (existing) existing.push(entry);
    else entriesByPerson.set(entry.person_id, [entry]);
  }

  const rows: RosterRow[] = volunteers.map((volunteer) => {
    const entries = entriesByPerson.get(volunteer.person_id) ?? [];
    return {
      personId: volunteer.person_id,
      person: volunteer.person,
      signup: volunteer,
      entries,
      totalHours: sumHours(entries),
    };
  });

  const signedUp = new Set(volunteers.map((volunteer) => volunteer.person_id));
  for (const [personId, entries] of entriesByPerson) {
    if (signedUp.has(personId)) continue;
    rows.push({
      personId,
      person: entries[0].person,
      signup: null,
      entries,
      totalHours: sumHours(entries),
    });
  }

  return rows.sort((a, b) => {
    const byName = personDisplayName(a.person).localeCompare(
      personDisplayName(b.person),
    );
    return byName !== 0 ? byName : a.personId.localeCompare(b.personId);
  });
}

/** The role a signup shows: its shift's, else the free text it was given. */
function roleLabelFor(row: RosterRow, shifts: EventShift[]) {
  if (!row.signup) return "—";
  const assignedShift = shifts.find(
    (shift) => shift.id === row.signup?.shift_id,
  );
  if (assignedShift) return assignedShift.role_type?.name ?? "No role";
  return row.signup.role || "—";
}

export function RosterSection({
  eventId,
  rows,
  shifts,
  mode,
  isDeleting,
  loading,
  previewRows = LIST_PREVIEW_ROWS,
  onDeleteVolunteer,
  onDeleteHours,
  onShiftReassign,
  onSaved,
}: {
  eventId: string;
  rows: RosterRow[];
  shifts: EventShift[];
  mode: "view" | "edit";
  isDeleting: boolean;
  loading: boolean;
  /** Overridable so tests don't have to build six rows. `null` disables the cap. */
  previewRows?: number | null;
  onDeleteVolunteer: (id: string) => void;
  onDeleteHours: (id: string) => void;
  onShiftReassign: (volunteerId: string, shiftId: string | null) => void;
  onSaved: () => void;
}) {
  const baseId = useId();
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const totalHours = sumHours(rows.flatMap((row) => row.entries));
  const unsignedCount = rows.filter((row) => !row.signup).length;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      personDisplayName(row.person).toLowerCase().includes(needle),
    );
  }, [rows, query]);

  const capped = previewRows === null ? rows : rows.slice(0, previewRows);
  const hasOverflow = previewRows !== null && rows.length > previewRows;

  /**
   * Rendered twice -- capped in the card, in full in the sheet -- so each copy
   * needs its own `tableId`; the detail-row ids hang off it and would otherwise
   * collide while both are mounted.
   */
  function rosterTable(
    tableRows: RosterRow[],
    tableId: string,
    stickyHeader = false,
  ) {
    return (
      <Table id={tableId} stickyFirstColumn>
        <TableHeader
          className={stickyHeader ? "sticky top-0 z-10 bg-popover" : undefined}
        >
          <TableRow>
            <TableHead>Volunteer</TableHead>
            <TableHead>Shift</TableHead>
            <TableHead hideBelow="md">Role</TableHead>
            <TableHead>Hours</TableHead>
            <TableHead className="w-px">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableRows.map((row) => {
            const name = personDisplayName(row.person);
            const isOpen = expandedPersonId === row.personId;
            const detailId = `${tableId}-hours-${row.personId}`;

            return (
              <Fragment key={row.personId}>
                <TableRow>
                  <TableCell
                    className="max-w-xs truncate font-medium"
                    title={row.person?.name ?? undefined}
                  >
                    {name}
                    {!row.signup && (
                      <Badge
                        variant="outline"
                        className="ml-2"
                        title="Hours logged from Volunteers > Participation. This person has no signup for this event."
                      >
                        Not signed up
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell className="app-muted">
                    {row.signup && mode === "edit" && shifts.length > 0 ? (
                      <Select
                        value={row.signup.shift_id ?? NONE_VALUE}
                        onValueChange={(value) =>
                          onShiftReassign(
                            row.signup!.id,
                            value === NONE_VALUE ? null : value,
                          )
                        }
                      >
                        <SelectTrigger
                          className="w-full"
                          size="sm"
                          aria-label={`Shift for ${row.person?.name ?? "volunteer"}`}
                        >
                          <SelectValue placeholder="No shift">
                            {(value: string) =>
                              shifts.find((s) => s.id === value)?.label ??
                              "No shift"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>No shift</SelectItem>
                          {shifts.map((shift) => (
                            <SelectItem key={shift.id} value={shift.id}>
                              {shift.label} ({formatShiftRange(shift)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      (shifts.find((s) => s.id === row.signup?.shift_id)
                        ?.label ?? "—")
                    )}
                  </TableCell>

                  <TableCell className="app-muted" hideBelow="md">
                    {roleLabelFor(row, shifts)}
                  </TableCell>

                  <TableCell>
                    {row.entries.length === 0 ? (
                      "—"
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-expanded={isOpen}
                        aria-controls={isOpen ? detailId : undefined}
                        onClick={() =>
                          setExpandedPersonId(isOpen ? null : row.personId)
                        }
                      >
                        {row.totalHours}
                        <span className="sr-only">
                          {` hours logged by ${name}, ${row.entries.length} ${
                            row.entries.length === 1 ? "entry" : "entries"
                          }`}
                        </span>
                        <ChevronDown
                          aria-hidden
                          className={cn(
                            "transition-transform",
                            isOpen && "rotate-180",
                          )}
                        />
                      </Button>
                    )}
                  </TableCell>

                  <TableCell className="text-right whitespace-nowrap">
                    {mode === "edit" && row.signup && (
                      <>
                        {/* Hours can only be logged against a signup --
                                createEventVolunteerHoursAction rejects anyone
                                without one -- so hours-only rows get no
                                trigger that could only ever fail. */}
                        <LogHoursDialog
                          eventId={eventId}
                          personId={row.personId}
                          onSaved={onSaved}
                          triggerLabel={<Clock />}
                          triggerRender={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Log hours for ${name}`}
                            />
                          }
                        />
                        <ConfirmDeleteButton
                          label="Remove volunteer"
                          title={`Remove ${name} from this event?`}
                          description="This deletes their signup and any shift assigned to it. It can't be undone."
                          confirmLabel="Remove"
                          pending={isDeleting}
                          onConfirm={() => onDeleteVolunteer(row.signup!.id)}
                        />
                      </>
                    )}
                  </TableCell>
                </TableRow>

                {isOpen && (
                  <TableRow id={detailId}>
                    <TableCell colSpan={5} className="p-0">
                      <ul className="flex flex-col gap-1 px-3 py-2">
                        {row.entries.map((entry) => (
                          <li
                            key={entry.id}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="app-muted">
                              {formatCalendarDate(entry.logged_date)} ·{" "}
                              {entry.hours} h
                              {entry.notes ? ` · ${entry.notes}` : ""}
                            </span>
                            {mode === "edit" && (
                              <ConfirmDeleteButton
                                label={`Remove hours entry for ${name}`}
                                title={`Remove ${name}'s logged hours?`}
                                description="Volunteer hours feed grant reporting, so removing this changes reported totals. It can't be undone."
                                confirmLabel="Remove"
                                pending={isDeleting}
                                onConfirm={() => onDeleteHours(entry.id)}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-4">
      <div>
        <h3 className="text-sm font-semibold">Roster</h3>
        {rows.length > 0 && (
          <p className="app-muted text-sm">
            {rows.length} {rows.length === 1 ? "volunteer" : "volunteers"}
            {totalHours > 0 ? ` · ${totalHours} hours logged` : ""}
          </p>
        )}
      </div>

      {loading ? (
        <TabLoadingSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No volunteers yet"
          description="Sign someone up, then log their hours against this event."
          action={
            mode === "edit" ? (
              <AddVolunteerDialog eventId={eventId} onSaved={onSaved} />
            ) : undefined
          }
        />
      ) : (
        <>
          {rosterTable(capped, `${baseId}-preview`)}

          {hasOverflow && (
            <ListPreviewSheet
              title="Roster"
              description={`${rows.length} ${rows.length === 1 ? "volunteer" : "volunteers"}${totalHours > 0 ? ` · ${totalHours} hours logged` : ""}`}
              triggerLabel={`View all ${rows.length} volunteers`}
              searchPlaceholder="Search volunteers"
              searchLabel="Search volunteers"
              query={query}
              onQueryChange={setQuery}
              totalCount={rows.length}
              filteredCount={filtered.length}
            >
              {filtered.length === 0 ? (
                <EmptyState
                  title="No matching volunteers"
                  description="Clear or loosen the search to see more."
                />
              ) : (
                rosterTable(filtered, `${baseId}-all`, true)
              )}
            </ListPreviewSheet>
          )}

          {unsignedCount > 0 && (
            <p className="app-muted text-sm">
              {unsignedCount}{" "}
              {unsignedCount === 1 ? "person has" : "people have"} hours logged
              for this event without a signup. Sign them up to log more against
              this event.
            </p>
          )}
        </>
      )}
    </div>
  );
}
