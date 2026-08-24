"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  createGiveawayPrizeAction,
  deleteGiveawayPrizeAction,
  getEventGiveawayAction,
  upsertEventGiveawayAction,
  upsertGiveawayWinnerAction,
  type Giveaway,
  type GiveawayPrize,
  type GiveawayWinner,
} from "./giveaway-actions";
import { PersonPicker, type PickedPerson } from "../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../people/actions";
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
import { Textarea } from "@/components/ui/textarea";

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function formatMoney(value: number | string | null) {
  if (value === null || value === undefined) return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? currencyFormatter.format(numeric) : "—";
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return dateFormatter.format(new Date(iso));
}

function toDateInputValue(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

const DISTRIBUTION_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "distributed", label: "Distributed" },
  { value: "unclaimed", label: "Unclaimed" },
  { value: "other", label: "Other" },
];

const DISTRIBUTION_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  DISTRIBUTION_STATUSES.map((option) => [option.value, option.label])
);

function GiveawaySalesForm({
  eventId,
  giveaway,
  onSaved,
  onCancel,
}: {
  eventId: string;
  giveaway: Giveaway | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(giveaway?.name ?? "");
  const [ticketsSold, setTicketsSold] = useState(String(giveaway?.tickets_sold ?? 0));
  const [ticketPrice, setTicketPrice] = useState(
    giveaway?.ticket_price === null || giveaway?.ticket_price === undefined ? "" : String(giveaway.ticket_price)
  );
  const [revenueAmount, setRevenueAmount] = useState(String(giveaway?.revenue_amount ?? 0));
  const [drawingDate, setDrawingDate] = useState(toDateInputValue(giveaway?.drawing_date ?? null));
  const [notes, setNotes] = useState(giveaway?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("ticketsSold", ticketsSold);
    formData.set("ticketPrice", ticketPrice);
    formData.set("revenueAmount", revenueAmount);
    formData.set("drawingDate", drawingDate);
    formData.set("notes", notes);

    startTransition(async () => {
      const result = await upsertEventGiveawayAction(eventId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-[var(--line)] p-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="giveaway-name">Giveaway name</FieldLabel>
          <Input id="giveaway-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="giveaway-ticketsSold">Tickets sold</FieldLabel>
            <Input
              id="giveaway-ticketsSold"
              type="number"
              min={0}
              step={1}
              value={ticketsSold}
              onChange={(e) => setTicketsSold(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="giveaway-ticketPrice">Ticket price ($)</FieldLabel>
            <Input
              id="giveaway-ticketPrice"
              type="number"
              min="0"
              step="0.01"
              value={ticketPrice}
              onChange={(e) => setTicketPrice(e.target.value)}
            />
          </Field>
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="giveaway-revenue">Revenue ($)</FieldLabel>
            <Input
              id="giveaway-revenue"
              type="number"
              min="0"
              step="0.01"
              value={revenueAmount}
              onChange={(e) => setRevenueAmount(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="giveaway-drawingDate">Drawing date</FieldLabel>
            <Input
              id="giveaway-drawingDate"
              type="date"
              value={drawingDate}
              onChange={(e) => setDrawingDate(e.target.value)}
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="giveaway-notes">Notes</FieldLabel>
          <Textarea id="giveaway-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : giveaway ? "Save giveaway" : "Set up giveaway"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function GiveawaySummary({
  giveaway,
  onEdit,
  canEdit,
}: {
  giveaway: Giveaway;
  onEdit: () => void;
  canEdit: boolean;
}) {
  return (
    <div className="rounded-md border border-[var(--line)] p-4">
      <FieldGroup>
        <ReadOnlyField label="Giveaway name" htmlFor="giveaway-name">
          {giveaway.name || "—"}
        </ReadOnlyField>

        <Field orientation="responsive">
          <ReadOnlyField label="Tickets sold" htmlFor="giveaway-ticketsSold">
            {giveaway.tickets_sold}
          </ReadOnlyField>
          <ReadOnlyField label="Ticket price" htmlFor="giveaway-ticketPrice">
            {formatMoney(giveaway.ticket_price)}
          </ReadOnlyField>
        </Field>

        <Field orientation="responsive">
          <ReadOnlyField label="Revenue" htmlFor="giveaway-revenue">
            {formatMoney(giveaway.revenue_amount)}
          </ReadOnlyField>
          <ReadOnlyField label="Drawing date" htmlFor="giveaway-drawingDate">
            {formatDate(giveaway.drawing_date)}
          </ReadOnlyField>
        </Field>

        <ReadOnlyField label="Notes" htmlFor="giveaway-notes">
          {giveaway.notes || "—"}
        </ReadOnlyField>
      </FieldGroup>

      {canEdit && (
        <div className="mt-3 flex justify-end">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit giveaway" onClick={onEdit}>
            <Pencil />
          </Button>
        </div>
      )}
    </div>
  );
}

function WinnerForm({
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
  const [winnerContact, setWinnerContact] = useState(winner?.winner_contact ?? "");
  const [status, setStatus] = useState(winner?.distribution_status ?? "pending");
  const [distributedAt, setDistributedAt] = useState(toDateInputValue(winner?.distributed_at ?? null));
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
            <FieldLabel htmlFor={`winner-name-${prize.id}`}>Winner name</FieldLabel>
            <Input
              id={`winner-name-${prize.id}`}
              value={winnerName}
              onChange={(e) => setWinnerName(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`winner-contact-${prize.id}`}>Winner contact</FieldLabel>
            <Input
              id={`winner-contact-${prize.id}`}
              value={winnerContact}
              onChange={(e) => setWinnerContact(e.target.value)}
            />
          </Field>
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor={`winner-status-${prize.id}`}>Distribution status</FieldLabel>
            <Select value={status} onValueChange={(value) => setStatus(value ?? "pending")}>
              <SelectTrigger id={`winner-status-${prize.id}`} className="w-full">
                <SelectValue placeholder="Select status">
                  {(value: string) => DISTRIBUTION_STATUS_LABELS[value] ?? "Select status"}
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
            <FieldLabel htmlFor={`winner-distributedAt-${prize.id}`}>Distributed on</FieldLabel>
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
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Saving..." : "Save winner"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function WinnerSummary({
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
          <ReadOnlyField label="Winner name" htmlFor={`winner-name-view-${winner.id}`}>
            {winner.winner_name || "—"}
          </ReadOnlyField>
          <ReadOnlyField label="Winner contact" htmlFor={`winner-contact-view-${winner.id}`}>
            {winner.winner_contact || "—"}
          </ReadOnlyField>
        </Field>
        <Field orientation="responsive">
          <ReadOnlyField label="Distribution status" htmlFor={`winner-status-view-${winner.id}`}>
            {DISTRIBUTION_STATUS_LABELS[winner.distribution_status] ?? winner.distribution_status}
          </ReadOnlyField>
          <ReadOnlyField label="Distributed on" htmlFor={`winner-distributedAt-view-${winner.id}`}>
            {formatDate(winner.distributed_at)}
          </ReadOnlyField>
        </Field>
      </FieldGroup>
      {canEdit && (
        <div className="mt-2 flex justify-end">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit winner" onClick={onEdit}>
            <Pencil />
          </Button>
        </div>
      )}
    </div>
  );
}

function PrizeWinnerSection({
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
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          + Record winner
        </Button>
      </div>
    ) : null;
  }

  return <WinnerSummary winner={winner} onEdit={onEdit} canEdit={canEdit} />;
}

function AddPrizeForm({
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
      const result = await createGiveawayPrizeAction(giveawayId, selectedDonor?.id ?? null, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-[var(--line)] p-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="prize-name">Prize name</FieldLabel>
          <Input id="prize-name" required value={prizeName} onChange={(e) => setPrizeName(e.target.value)} />
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
          <Textarea id="prize-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
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

export function GiveawayTab({
  eventId,
  active,
  mode,
}: {
  eventId: string;
  active: boolean;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const [giveaway, setGiveaway] = useState<Giveaway | null | undefined>(undefined);
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [editingSales, setEditingSales] = useState(false);
  const [editingWinnerId, setEditingWinnerId] = useState<string | null>(null);
  const [showAddPrize, setShowAddPrize] = useState(false);
  const [prevMode, setPrevMode] = useState(mode);
  const canEdit = mode === "edit";

  if (mode !== prevMode) {
    setPrevMode(mode);
    if (mode === "view") {
      setEditingSales(false);
      setEditingWinnerId(null);
      setShowAddPrize(false);
    }
  }

  function load() {
    getEventGiveawayAction(eventId).then((result) => {
      if ("error" in result) {
        setLoadError(result.error);
      } else {
        setLoadError(null);
        setGiveaway(result.data);
      }
    });
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
  }

  function refresh() {
    load();
    router.refresh();
  }

  useEffect(() => {
    if (!active) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, eventId]);

  function handlePersonCreated(person: PickedPerson) {
    setPeople((prev) => [...prev, { ...person, is_sponsor: false }]);
  }

  function handleDeletePrize(id: string) {
    startDeleteTransition(async () => {
      await deleteGiveawayPrizeAction(id);
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="app-muted text-xs">
        This tab only records giveaway results. Public-facing ticket sales require a legal, tax, and
        jurisdictional review before being enabled.
      </p>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {giveaway === undefined ? (
        <p className="app-muted text-sm">Loading giveaway...</p>
      ) : (
        <>
          {editingSales ? (
            <GiveawaySalesForm
              eventId={eventId}
              giveaway={giveaway}
              onSaved={() => {
                setEditingSales(false);
                refresh();
              }}
              onCancel={() => setEditingSales(false)}
            />
          ) : giveaway ? (
            <GiveawaySummary giveaway={giveaway} onEdit={() => setEditingSales(true)} canEdit={canEdit} />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="app-muted text-sm">No giveaway set up yet.</p>
              {canEdit && (
                <div>
                  <Button type="button" variant="outline" onClick={() => setEditingSales(true)}>
                    + Set up giveaway
                  </Button>
                </div>
              )}
            </div>
          )}

          {giveaway && (
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-semibold">Prizes</h4>
              {giveaway.giveaway_prizes.length === 0 && (
                <p className="app-muted text-sm">No prizes added yet.</p>
              )}
              {giveaway.giveaway_prizes.map((prize) => (
                <div key={prize.id} className="rounded-md border border-[var(--line)] p-3">
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
                        onClick={() => handleDeletePrize(prize.id)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <PrizeWinnerSection
                    prize={prize}
                    editing={editingWinnerId === prize.id}
                    canEdit={canEdit}
                    onEdit={() => setEditingWinnerId(prize.id)}
                    onSaved={() => {
                      setEditingWinnerId(null);
                      refresh();
                    }}
                    onCancel={() => setEditingWinnerId(null)}
                  />
                </div>
              ))}

              {canEdit &&
                (showAddPrize ? (
                  <AddPrizeForm
                    giveawayId={giveaway.id}
                    people={people}
                    onPersonCreated={handlePersonCreated}
                    onSaved={() => {
                      setShowAddPrize(false);
                      refresh();
                    }}
                    onCancel={() => setShowAddPrize(false)}
                  />
                ) : (
                  <div>
                    <Button type="button" variant="outline" onClick={() => setShowAddPrize(true)}>
                      + Add prize
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
