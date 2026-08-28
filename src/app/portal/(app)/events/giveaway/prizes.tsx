"use client";

import { FormEvent, useState, useTransition } from "react";
import { createGiveawayPrizeAction, type Giveaway } from "../giveaway-actions";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { type PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "./format";
import { PrizeWinnerSection } from "./winners";

export function AddPrizeForm({
  giveawayId,
  people,
  onPersonCreated,
  onSaved,
  onCancel,
}: {
  giveawayId: string;
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [prizeName, setPrizeName] = useState("");
  const [selectedDonor, setSelectedDonor] = useState<PickedPerson | null>(null);
  const [estimatedValue, setEstimatedValue] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("prizeName", prizeName);
    formData.set("estimatedValue", estimatedValue);
    formData.set("notes", notes);

    startTransition(async () => {
      const result = await createGiveawayPrizeAction(
        giveawayId,
        selectedDonor?.id ?? null,
        formData,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="prize-name">Prize name</FieldLabel>
          <Input
            id="prize-name"
            required
            value={prizeName}
            onChange={(e) => setPrizeName(e.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel>Prize donor</FieldLabel>
          <PersonPicker
            people={people}
            selected={selectedDonor}
            onSelect={setSelectedDonor}
            onPersonCreated={onPersonCreated}
            newPersonRole="is_donor"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="prize-value">Estimated value ($)</FieldLabel>
          <Input
            id="prize-value"
            type="number"
            min="0"
            step="0.01"
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="prize-notes">Notes</FieldLabel>
          <Textarea
            id="prize-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
            {isPending ? "Saving..." : "Add prize"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function PrizesSection({
  giveaway,
  people,
  canEdit,
  isDeleting,
  editingWinnerId,
  showAddPrize,
  onPersonCreated,
  onDeletePrize,
  onEditWinner,
  onWinnerSaved,
  onCancelWinnerEdit,
  onToggleAddPrize,
  onPrizeAdded,
}: {
  giveaway: Giveaway;
  people: PersonListItem[];
  canEdit: boolean;
  isDeleting: boolean;
  editingWinnerId: string | null;
  showAddPrize: boolean;
  onPersonCreated: (person: PickedPerson) => void;
  onDeletePrize: (id: string) => void;
  onEditWinner: (prizeId: string) => void;
  onWinnerSaved: () => void;
  onCancelWinnerEdit: () => void;
  onToggleAddPrize: (show: boolean) => void;
  onPrizeAdded: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold">Prizes</h4>
      {giveaway.giveaway_prizes.length === 0 && (
        <p className="app-muted text-sm">No prizes added yet.</p>
      )}
      {giveaway.giveaway_prizes.map((prize) => (
        <div
          key={prize.id}
          className="rounded-md border border-[var(--line)] p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{prize.prize_name}</p>
              <p className="app-muted text-xs">
                {prize.donor?.name ? `Donated by ${prize.donor.name} · ` : ""}
                {formatMoney(prize.estimated_value)}
              </p>
            </div>
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isDeleting}
                onClick={() => onDeletePrize(prize.id)}
              >
                Remove
              </Button>
            )}
          </div>
          <PrizeWinnerSection
            prize={prize}
            editing={editingWinnerId === prize.id}
            canEdit={canEdit}
            onEdit={() => onEditWinner(prize.id)}
            onSaved={onWinnerSaved}
            onCancel={onCancelWinnerEdit}
          />
        </div>
      ))}

      {canEdit &&
        (showAddPrize ? (
          <AddPrizeForm
            giveawayId={giveaway.id}
            people={people}
            onPersonCreated={onPersonCreated}
            onSaved={onPrizeAdded}
            onCancel={() => onToggleAddPrize(false)}
          />
        ) : (
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => onToggleAddPrize(true)}
            >
              + Add prize
            </Button>
          </div>
        ))}
    </div>
  );
}
