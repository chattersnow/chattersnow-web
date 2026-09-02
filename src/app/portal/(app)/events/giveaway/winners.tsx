"use client";

import { FormEvent, useState, useTransition } from "react";
import {
  upsertGiveawayWinnerAction,
  type GiveawayPrize,
  type GiveawayWinner,
} from "../giveaway-actions";
import { ReadOnlyField } from "@/components/ui/read-only-field";
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
import { Pencil } from "lucide-react";
import {
  DISTRIBUTION_STATUS_LABELS,
  DISTRIBUTION_STATUSES,
  formatDate,
  toDateInputValue,
} from "./format";
import { Spinner } from "@/components/ui/spinner";

export function WinnerForm({
  prize,
  onSaved,
  onCancel,
}: {
  prize: GiveawayPrize;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const winner = prize.giveaway_winners;
  const [winnerName, setWinnerName] = useState(winner?.winner_name ?? "");
  const [winnerContact, setWinnerContact] = useState(
    winner?.winner_contact ?? "",
  );
  const [status, setStatus] = useState(
    winner?.distribution_status ?? "pending",
  );
  const [distributedAt, setDistributedAt] = useState(
    toDateInputValue(winner?.distributed_at ?? null),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("winnerName", winnerName);
    formData.set("winnerContact", winnerContact);
    formData.set("distributionStatus", status);
    formData.set("distributedAt", distributedAt);

    startTransition(async () => {
      const result = await upsertGiveawayWinnerAction(prize.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 rounded-md bg-muted/40 p-3">
      <FieldGroup>
        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor={`winner-name-${prize.id}`}>
              Winner name
            </FieldLabel>
            <Input
              id={`winner-name-${prize.id}`}
              value={winnerName}
              onChange={(e) => setWinnerName(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`winner-contact-${prize.id}`}>
              Winner contact
            </FieldLabel>
            <Input
              id={`winner-contact-${prize.id}`}
              value={winnerContact}
              onChange={(e) => setWinnerContact(e.target.value)}
            />
          </Field>
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor={`winner-status-${prize.id}`}>
              Distribution status
            </FieldLabel>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value ?? "pending")}
            >
              <SelectTrigger
                id={`winner-status-${prize.id}`}
                className="w-full"
              >
                <SelectValue placeholder="Select status">
                  {(value: string) =>
                    DISTRIBUTION_STATUS_LABELS[value] ?? "Select status"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DISTRIBUTION_STATUSES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`winner-distributedAt-${prize.id}`}>
              Distributed on
            </FieldLabel>
            <Input
              id={`winner-distributedAt-${prize.id}`}
              type="date"
              value={distributedAt}
              onChange={(e) => setDistributedAt(e.target.value)}
            />
          </Field>
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save winner"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function WinnerSummary({
  winner,
  onEdit,
  canEdit,
}: {
  winner: GiveawayWinner;
  onEdit: () => void;
  canEdit: boolean;
}) {
  return (
    <div className="mt-3 rounded-md bg-muted/40 p-3">
      <FieldGroup>
        <Field orientation="responsive">
          <ReadOnlyField
            label="Winner name"
            htmlFor={`winner-name-view-${winner.id}`}
          >
            {winner.winner_name || "—"}
          </ReadOnlyField>
          <ReadOnlyField
            label="Winner contact"
            htmlFor={`winner-contact-view-${winner.id}`}
          >
            {winner.winner_contact || "—"}
          </ReadOnlyField>
        </Field>
        <Field orientation="responsive">
          <ReadOnlyField
            label="Distribution status"
            htmlFor={`winner-status-view-${winner.id}`}
          >
            {DISTRIBUTION_STATUS_LABELS[winner.distribution_status] ??
              winner.distribution_status}
          </ReadOnlyField>
          <ReadOnlyField
            label="Distributed on"
            htmlFor={`winner-distributedAt-view-${winner.id}`}
          >
            {formatDate(winner.distributed_at)}
          </ReadOnlyField>
        </Field>
      </FieldGroup>
      {canEdit && (
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Edit winner"
            onClick={onEdit}
          >
            <Pencil />
          </Button>
        </div>
      )}
    </div>
  );
}

export function PrizeWinnerSection({
  prize,
  editing,
  canEdit,
  onEdit,
  onSaved,
  onCancel,
}: {
  prize: GiveawayPrize;
  editing: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const winner = prize.giveaway_winners;

  if (editing) {
    return <WinnerForm prize={prize} onSaved={onSaved} onCancel={onCancel} />;
  }

  if (!winner) {
    return canEdit ? (
      <div className="mt-3">
        <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
          + Record winner
        </Button>
      </div>
    ) : null;
  }

  return <WinnerSummary winner={winner} onEdit={onEdit} canEdit={canEdit} />;
}
