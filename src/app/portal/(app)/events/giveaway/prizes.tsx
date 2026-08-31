"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import {
  createGiveawayPrizeAction,
  listAvailableGiveawaySourcesAction,
  type AvailableInventoryItemSource,
  type AvailableMonetaryDonationSource,
  type Giveaway,
} from "../giveaway-actions";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { type PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "./format";
import { PrizeWinnerSection } from "./winners";
import { Spinner } from "@/components/ui/spinner";

const NO_SOURCE = "none";

function sourceKeyFor(kind: "item" | "donation", id: string) {
  return `${kind}:${id}`;
}

export function AddPrizeForm({
  giveawayId,
  eventId,
  people,
  onPersonCreated,
  onSaved,
  onCancel,
}: {
  giveawayId: string;
  eventId: string;
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

  const [sources, setSources] = useState<{
    inventoryItems: AvailableInventoryItemSource[];
    monetaryDonations: AvailableMonetaryDonationSource[];
  } | null>(null);
  const [selectedSourceKey, setSelectedSourceKey] = useState(NO_SOURCE);

  useEffect(() => {
    let cancelled = false;
    listAvailableGiveawaySourcesAction(eventId).then((result) => {
      if (cancelled) return;
      if ("data" in result) setSources(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  function handleSourceChange(key: string | null) {
    if (!key) return;
    setSelectedSourceKey(key);
    if (key === NO_SOURCE) return;

    const [kind, id] = key.split(":");
    if (kind === "item") {
      const item = sources?.inventoryItems.find((i) => i.id === id);
      if (!item) return;
      setPrizeName(item.description);
      setEstimatedValue(
        item.face_value === null ? "" : String(item.face_value),
      );
      if (item.donor) setSelectedDonor(item.donor);
    } else if (kind === "donation") {
      const donation = sources?.monetaryDonations.find((d) => d.id === id);
      if (!donation) return;
      setPrizeName("Cash contribution");
      setEstimatedValue(String(donation.amount));
      if (donation.donor) setSelectedDonor(donation.donor);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("prizeName", prizeName);
    formData.set("estimatedValue", estimatedValue);
    formData.set("notes", notes);

    const [kind, id] =
      selectedSourceKey === NO_SOURCE
        ? [null, null]
        : selectedSourceKey.split(":");

    startTransition(async () => {
      const result = await createGiveawayPrizeAction(
        giveawayId,
        selectedDonor?.id ?? null,
        formData,
        kind === "item" ? id : null,
        kind === "donation" ? id : null,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  const hasSources =
    (sources?.inventoryItems.length ?? 0) > 0 ||
    (sources?.monetaryDonations.length ?? 0) > 0;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        {hasSources && (
          <Field>
            <FieldLabel>Link to an existing donation (optional)</FieldLabel>
            <Select
              value={selectedSourceKey}
              onValueChange={handleSourceChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Enter prize details manually" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SOURCE}>
                  Enter prize details manually
                </SelectItem>
                {(sources?.inventoryItems.length ?? 0) > 0 && (
                  <SelectGroup>
                    <SelectLabel>In-kind donations</SelectLabel>
                    {sources!.inventoryItems.map((item) => (
                      <SelectItem
                        key={item.id}
                        value={sourceKeyFor("item", item.id)}
                      >
                        {item.description}
                        {item.donor?.name ? ` — ${item.donor.name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {(sources?.monetaryDonations.length ?? 0) > 0 && (
                  <SelectGroup>
                    <SelectLabel>Cash donations</SelectLabel>
                    {sources!.monetaryDonations.map((donation) => (
                      <SelectItem
                        key={donation.id}
                        value={sourceKeyFor("donation", donation.id)}
                      >
                        {formatMoney(donation.amount)}
                        {donation.donor?.name
                          ? ` — ${donation.donor.name}`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </Field>
        )}

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
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Add prize"
            )}
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
              {(prize.source_item || prize.source_donation) && (
                <p className="app-muted text-xs">
                  Sourced from:{" "}
                  {prize.source_item?.description ??
                    formatMoney(prize.source_donation?.amount ?? null)}
                </p>
              )}
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
            eventId={giveaway.event_id}
            people={people}
            onPersonCreated={onPersonCreated}
            onSaved={onPrizeAdded}
            onCancel={() => onToggleAddPrize(false)}
          />
        ) : (
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onToggleAddPrize(true)}
            >
              + Add prize
            </Button>
          </div>
        ))}
    </div>
  );
}
