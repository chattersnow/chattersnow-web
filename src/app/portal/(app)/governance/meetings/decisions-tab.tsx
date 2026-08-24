"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  createDecisionAction,
  deleteDecisionAction,
  listDecisionsAction,
  type Decision,
} from "./decisions-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function AddDecisionForm({
  defaultDate,
  onSubmit,
  onCancel,
}: {
  defaultDate: string;
  onSubmit: (
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [decisionDate, setDecisionDate] = useState(defaultDate);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("description", description);
    formData.set("decisionDate", decisionDate);

    startTransition(async () => {
      const result = await onSubmit(formData);
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
        <Field>
          <FieldLabel htmlFor="new-decision-description">
            Description
          </FieldLabel>
          <Textarea
            id="new-decision-description"
            required
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="new-decision-date">Date</FieldLabel>
          <Input
            id="new-decision-date"
            type="date"
            required
            value={decisionDate}
            onChange={(event) => setDecisionDate(event.target.value)}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Add decision"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function DecisionsTab({
  meetingId,
  meetingDate,
  active,
  mode,
}: {
  meetingId: string;
  meetingDate: string;
  active: boolean;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [prevMode, setPrevMode] = useState(mode);

  if (mode !== prevMode) {
    setPrevMode(mode);
    if (mode === "view") setShowAdd(false);
  }

  function load() {
    listDecisionsAction(meetingId).then((result) => {
      if ("error" in result) setLoadError(result.error);
      else setDecisions(result.data);
    });
  }

  useEffect(() => {
    if (!active) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, meetingId]);

  function refresh() {
    load();
    router.refresh();
  }

  function handleDelete(id: string) {
    startDeleteTransition(async () => {
      await deleteDecisionAction(id);
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

      {decisions === null ? (
        <p className="app-muted text-sm">Loading decisions...</p>
      ) : decisions.length === 0 && !showAdd ? (
        <p className="app-muted text-sm">No decisions recorded yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {decisions?.map((decision) => (
              <TableRow key={decision.id}>
                <TableCell className="whitespace-normal font-medium">
                  {decision.description}
                </TableCell>
                <TableCell className="app-muted">
                  {formatDate(decision.decision_date)}
                </TableCell>
                <TableCell className="text-right">
                  {mode === "edit" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove decision"
                      disabled={isDeleting}
                      onClick={() => handleDelete(decision.id)}
                    >
                      <Trash2 />
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
          <AddDecisionForm
            defaultDate={meetingDate}
            onSubmit={(formData) => createDecisionAction(meetingId, formData)}
            onCancel={() => setShowAdd(false)}
          />
        ) : (
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAdd(true)}
            >
              + Add decision
            </Button>
          </div>
        ))}
    </div>
  );
}
