"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createDecisionAction,
  deleteDecisionAction,
  listDecisionsAction,
  type Decision,
} from "./decisions-actions";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
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
import { useResetOnModeChange, useTabData } from "@/hooks/use-tab-data";
import { Spinner } from "@/components/ui/spinner";
import { formatCalendarDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";

function AddDecisionForm({
  defaultDate,
  onSubmit,
  onCancel,
  onSaved,
}: {
  defaultDate: string;
  onSubmit: (
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [voteResult, setVoteResult] = useState("");
  const [decisionDate, setDecisionDate] = useState(defaultDate);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("topic", topic);
    formData.set("description", description);
    formData.set("voteResult", voteResult);
    formData.set("decisionDate", decisionDate);

    startTransition(async () => {
      await runAction(() => onSubmit(formData), {
        success: "Decision recorded.",
        onError: setError,
        onSuccess: () => {
          router.refresh();
          onSaved();
        },
      });
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="new-decision-topic">Topic</FieldLabel>
          <Input
            id="new-decision-topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="new-decision-description">Discussion</FieldLabel>
          <Textarea
            id="new-decision-description"
            required
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="new-decision-vote">Vote</FieldLabel>
          <Input
            id="new-decision-vote"
            placeholder="e.g. Passed 5-0"
            value={voteResult}
            onChange={(event) => setVoteResult(event.target.value)}
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
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Add decision"
            )}
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
  const {
    data: decisions,
    loadError,
    refresh: refreshDecisions,
  } = useTabData<Decision[]>(() => listDecisionsAction(meetingId), active, [
    meetingId,
  ]);
  const [showAdd, setShowAdd] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();

  useResetOnModeChange(mode, () => setShowAdd(false));

  function refresh() {
    refreshDecisions();
    router.refresh();
  }

  function handleDelete(id: string) {
    startDeleteTransition(async () => {
      await runAction(() => deleteDecisionAction(id), {
        success: "Decision deleted.",
        error: "Could not delete the decision. Please try again.",
        onSuccess: refresh,
      });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {decisions === undefined ? (
        <TabLoadingSkeleton />
      ) : decisions.length === 0 && !showAdd ? (
        <EmptyState
          title="No decisions recorded yet"
          description={
            mode === "edit"
              ? "Record the first one with Add decision below."
              : "Decisions appear here once a governance manager records them for this meeting."
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Topic</TableHead>
              <TableHead>Discussion</TableHead>
              <TableHead>Vote</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {decisions?.map((decision) => (
              <TableRow key={decision.id}>
                <TableCell className="app-muted">
                  {decision.topic || "—"}
                </TableCell>
                <TableCell className="whitespace-normal font-medium">
                  {decision.description}
                </TableCell>
                <TableCell className="app-muted">
                  {decision.vote_result || "—"}
                </TableCell>
                <TableCell className="app-muted">
                  {formatCalendarDate(decision.decision_date)}
                </TableCell>
                <TableCell className="text-right">
                  {mode === "edit" && (
                    <ConfirmDeleteButton
                      label="Remove decision"
                      title="Remove this decision?"
                      description="This deletes the decision and its vote result from the meeting record. It can't be undone."
                      confirmLabel="Remove"
                      pending={isDeleting}
                      onConfirm={() => handleDelete(decision.id)}
                    />
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
            onSaved={() => {
              setShowAdd(false);
              refresh();
            }}
          />
        ) : (
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAdd(true)}
            >
              + Add decision
            </Button>
          </div>
        ))}
    </div>
  );
}
