"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createRafflePrizeAction,
  deleteRafflePrizeAction,
  getEventRaffleAction,
  upsertEventRaffleAction,
  upsertRaffleWinnerAction,
  type Raffle,
  type RafflePrize,
} from "./raffle-actions";
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

function formatMoney(value: number | string | null) {
  if (value === null || value === undefined) return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? currencyFormatter.format(numeric) : "—";
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

function RaffleSalesForm({ eventId, raffle, onSaved }: { eventId: string; raffle: Raffle | null; onSaved: () => void }) {
  const [name, setName] = useState(raffle?.name ?? "");
  const [ticketsSold, setTicketsSold] = useState(String(raffle?.tickets_sold ?? 0));
  const [ticketPrice, setTicketPrice] = useState(
    raffle?.ticket_price === null || raffle?.ticket_price === undefined ? "" : String(raffle.ticket_price)
  );
  const [revenueAmount, setRevenueAmount] = useState(String(raffle?.revenue_amount ?? 0));
  const [drawingDate, setDrawingDate] = useState(toDateInputValue(raffle?.drawing_date ?? null));
  const [notes, setNotes] = useState(raffle?.notes ?? "");
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
      const result = await upsertEventRaffleAction(eventId, formData);
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
          <FieldLabel htmlFor="raffle-name">Raffle name</FieldLabel>
          <Input id="raffle-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="raffle-ticketsSold">Tickets sold</FieldLabel>
            <Input
              id="raffle-ticketsSold"
              type="number"
              min={0}
              step={1}
              value={ticketsSold}
              onChange={(e) => setTicketsSold(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="raffle-ticketPrice">Ticket price ($)</FieldLabel>
            <Input
              id="raffle-ticketPrice"
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
            <FieldLabel htmlFor="raffle-revenue">Revenue ($)</FieldLabel>
            <Input
              id="raffle-revenue"
              type="number"
              min="0"
              step="0.01"
              value={revenueAmount}
              onChange={(e) => setRevenueAmount(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="raffle-drawingDate">Drawing date</FieldLabel>
            <Input
              id="raffle-drawingDate"
              type="date"
              value={drawingDate}
              onChange={(e) => setDrawingDate(e.target.value)}
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="raffle-notes">Notes</FieldLabel>
          <Textarea id="raffle-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : raffle ? "Save raffle" : "Set up raffle"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function WinnerForm({ prize, onSaved }: { prize: RafflePrize; onSaved: () => void }) {
  const winner = prize.raffle_winners[0] ?? null;
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
      const result = await upsertRaffleWinnerAction(prize.id, formData);
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
                  {(value: string) => DISTRIBUTION_STATUSES.find((option) => option.value === value)?.label ?? "Select status"}
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

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Saving..." : "Save winner"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function AddPrizeForm({ raffleId, onSaved }: { raffleId: string; onSaved: () => void }) {
  const [prizeName, setPrizeName] = useState("");
  const [donorName, setDonorName] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("prizeName", prizeName);
    formData.set("donorName", donorName);
    formData.set("estimatedValue", estimatedValue);
    formData.set("notes", notes);

    startTransition(async () => {
      const result = await createRafflePrizeAction(raffleId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setPrizeName("");
      setDonorName("");
      setEstimatedValue("");
      setNotes("");
      onSaved();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-[var(--line)] p-4">
      <FieldGroup>
        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="prize-name">Prize name</FieldLabel>
            <Input id="prize-name" required value={prizeName} onChange={(e) => setPrizeName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="prize-donor">Prize donor</FieldLabel>
            <Input id="prize-donor" value={donorName} onChange={(e) => setDonorName(e.target.value)} />
          </Field>
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

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Add prize"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function RaffleTab({ eventId, active }: { eventId: string; active: boolean }) {
  const router = useRouter();
  const [raffle, setRaffle] = useState<Raffle | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  function refresh() {
    getEventRaffleAction(eventId).then((result) => {
      if ("error" in result) {
        setLoadError(result.error);
      } else {
        setLoadError(null);
        setRaffle(result.data);
      }
    });
    router.refresh();
  }

  useEffect(() => {
    if (!active) return;
    getEventRaffleAction(eventId).then((result) => {
      if ("error" in result) {
        setLoadError(result.error);
      } else {
        setLoadError(null);
        setRaffle(result.data);
      }
    });
  }, [active, eventId]);

  function handleDeletePrize(id: string) {
    startDeleteTransition(async () => {
      await deleteRafflePrizeAction(id);
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="app-muted text-xs">
        This tab only records raffle results. Public-facing ticket sales require a legal, tax, and
        jurisdictional review before being enabled.
      </p>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {raffle === undefined ? (
        <p className="app-muted text-sm">Loading raffle...</p>
      ) : (
        <>
          <RaffleSalesForm eventId={eventId} raffle={raffle} onSaved={refresh} />

          {raffle && (
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-semibold">Prizes</h4>
              {raffle.raffle_prizes.length === 0 && (
                <p className="app-muted text-sm">No prizes added yet.</p>
              )}
              {raffle.raffle_prizes.map((prize) => (
                <div key={prize.id} className="rounded-md border border-[var(--line)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{prize.prize_name}</p>
                      <p className="app-muted text-xs">
                        {prize.donor_name ? `Donated by ${prize.donor_name} · ` : ""}
                        {formatMoney(prize.estimated_value)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isDeleting}
                      onClick={() => handleDeletePrize(prize.id)}
                    >
                      Remove
                    </Button>
                  </div>
                  <WinnerForm prize={prize} onSaved={refresh} />
                </div>
              ))}

              <AddPrizeForm raffleId={raffle.id} onSaved={refresh} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
