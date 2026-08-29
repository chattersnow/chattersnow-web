"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  createEventIncidentAction,
  deleteEventIncidentAction,
  listEventIncidentsAction,
  type EventIncident,
} from "./incidents-actions";
import { SeverityBadge } from "./event-badges";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";

const SEVERITIES = [
  { value: "minor", label: "Minor" },
  { value: "moderate", label: "Moderate" },
  { value: "serious", label: "Serious" },
];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function toDatetimeLocalValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function AddIncidentForm({
  eventId,
  onCancel,
}: {
  eventId: string;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [occurredAt, setOccurredAt] = useState(() =>
    toDatetimeLocalValue(new Date()),
  );
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("minor");
  const [peopleInvolved, setPeopleInvolved] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("occurredAt", occurredAt);
    formData.set("description", description);
    formData.set("severity", severity);
    formData.set("peopleInvolved", peopleInvolved);

    startTransition(async () => {
      const result = await createEventIncidentAction(eventId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onCancel();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="incident-occurredAt">When</FieldLabel>
            <Input
              id="incident-occurredAt"
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="incident-severity">Severity</FieldLabel>
            <Select
              value={severity}
              onValueChange={(value) => setSeverity(value ?? "minor")}
            >
              <SelectTrigger id="incident-severity" className="w-full">
                <SelectValue placeholder="Select severity">
                  {(value: string) =>
                    SEVERITIES.find((option) => option.value === value)
                      ?.label ?? "Select severity"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="incident-description">Description</FieldLabel>
          <Textarea
            id="incident-description"
            required
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="incident-peopleInvolved">
            People involved
          </FieldLabel>
          <Textarea
            id="incident-peopleInvolved"
            value={peopleInvolved}
            onChange={(event) => setPeopleInvolved(event.target.value)}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Log incident"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function IncidentsTab({
  eventId,
  active,
  mode,
}: {
  eventId: string;
  active: boolean;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const [incidents, setIncidents] = useState<EventIncident[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [prevMode, setPrevMode] = useState(mode);

  if (mode !== prevMode) {
    setPrevMode(mode);
    if (mode === "view") setShowAdd(false);
  }

  function load() {
    listEventIncidentsAction(eventId).then((result) => {
      if ("error" in result) setLoadError(result.error);
      else {
        setLoadError(null);
        setIncidents(result.data);
      }
    });
  }

  useEffect(() => {
    if (!active) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, eventId]);

  function refresh() {
    load();
    router.refresh();
  }

  function handleDelete(id: string) {
    startDeleteTransition(async () => {
      await deleteEventIncidentAction(id);
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {incidents === null ? (
        <TabLoadingSkeleton />
      ) : incidents.length === 0 && !showAdd ? (
        <p className="app-muted text-sm">No incidents recorded.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {incidents?.map((incident) => (
              <TableRow key={incident.id}>
                <TableCell className="app-muted whitespace-nowrap">
                  {dateFormatter.format(new Date(incident.occurred_at))}
                </TableCell>
                <TableCell>
                  <SeverityBadge severity={incident.severity} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  {incident.description}
                </TableCell>
                <TableCell className="text-right">
                  {mode === "edit" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove incident"
                      disabled={isDeleting}
                      onClick={() => handleDelete(incident.id)}
                    >
                      {isDeleting ? <Spinner /> : <Trash2 />}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {mode === "edit" &&
        (showAdd ? (
          <AddIncidentForm
            eventId={eventId}
            onCancel={() => {
              setShowAdd(false);
              refresh();
            }}
          />
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={() => setShowAdd(true)}
          >
            + Log incident
          </Button>
        ))}
    </div>
  );
}
