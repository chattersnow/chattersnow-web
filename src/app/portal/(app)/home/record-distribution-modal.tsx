"use client";

import { categoryLabelFor, flattenCategory } from "@/lib/inventory";
import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { List, ScanLine } from "lucide-react";
import type { DistributionDraft } from "@/lib/inventory-distribution-draft";
import {
  listAvailableInventoryItemsAction,
  recordEventDistributionAction,
  type AvailableInventoryItem,
} from "./distribution-actions";
import {
  discardDistributionDraftAction,
  getDistributionDraftAction,
  moveDistributionDraftAction,
  recordDistributionDraftAction,
  setDistributionDraftRecipientAction,
} from "./distribution-draft-actions";
import { ScannedDistributionList } from "./scanned-distribution-list";
import { listPeopleAction, type PersonListItem } from "../people/actions";
import { PersonPicker, type PickedPerson } from "../people/person-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PortalFormSurface } from "@/components/portal/portal-form-surface";
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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import {
  useControlledOpen,
  type ControlledOpenProps,
} from "@/components/portal/use-controlled-open";
import { useEventDateDefaults } from "../events/event-date-defaults";
import { nowDatetimeLocalInBrowser } from "@/lib/time";
import { removeTagsMessage, type ReleasedTag } from "@/lib/inventory-tags";

/**
 * The success toast's detail when recording freed numbered codes (#1444): it
 * stays until dismissed, because it is a job still to do -- taking the tags
 * off the gear.
 */
function removeTagsToast(tags: readonly ReleasedTag[] | undefined) {
  const description = removeTagsMessage(tags ?? []);
  return description ? { description, timeout: 0 } : {};
}

const NO_EVENT = "__none__";

export function RecordDistributionModal({
  triggerLabel = "Record distribution",
  open: controlledOpen,
  onOpenChange,
  withTrigger = true,
  eventId,
  eventOptions,
  showRecipientField = false,
  onSaved,
}: {
  triggerLabel?: string;
  /** The event the handout is at. With `eventOptions`, only the default. */
  eventId?: string;
  /** Offers an Event field (#1443) -- the item page, where the event is not
   *  implied by where the modal was opened. */
  eventOptions?: { id: string; name: string }[];
  showRecipientField?: boolean;
  onSaved?: () => void;
} & ControlledOpenProps) {
  const router = useRouter();
  const [open, setOpen] = useControlledOpen(controlledOpen, onOpenChange);
  const [availableItems, setAvailableItems] = useState<
    AvailableInventoryItem[]
  >([]);
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [recipient, setRecipient] = useState<PickedPerson | null>(null);

  const [inventoryItemId, setInventoryItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  // Opened from an event's Distributions card, gear was handed out at that
  // event, so the field opens on the event's start. Opened from Inventory or
  // the home dashboard there is no event in context and it stays "now".
  const eventDates = useEventDateDefaults();
  const defaultOccurredAt = () =>
    eventDates.startsAt || nowDatetimeLocalInBrowser();
  const [occurredAt, setOccurredAt] = useState(defaultOccurredAt);
  const [markDistributed, setMarkDistributed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Scan mode (#1420 part 3) builds a server-side list, one piece per scan,
  // and records it in one submit. The list outlives the modal, so reopening it
  // -- or adding from a tag opened in another tab -- picks up where it was.
  const [mode, setMode] = useState<"pick" | "scan">("pick");
  const [draft, setDraft] = useState<DistributionDraft | null>(null);
  const [conflictItemId, setConflictItemId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    eventId ?? null,
  );
  const draftEventId = selectedEventId;

  const loadDraft = useCallback(async () => {
    const result = await getDistributionDraftAction(draftEventId);
    if ("error" in result) return null;
    setDraft(result.data);
    return result.data;
  }, [draftEventId]);

  useEffect(() => {
    if (!open) return;
    getDistributionDraftAction(draftEventId).then((result) => {
      if ("error" in result) return;
      setDraft(result.data);
      if (result.data && result.data.items.length > 0) setMode("scan");
      // The recipient is kept on the list (#1443), so a list started in
      // another tab -- or before this one was closed -- comes back with it.
      if (showRecipientField && result.data?.recipient)
        setRecipient(result.data.recipient);
    });
    listAvailableInventoryItemsAction().then((result) => {
      if (!("error" in result)) setAvailableItems(result.data);
    });
    if (showRecipientField) {
      listPeopleAction().then((result) => {
        if (!("error" in result)) setPeople(result.data);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // An iPhone NFC tap adds to the list from a new Safari tab; coming back to
  // this one shows what it added.
  useEffect(() => {
    if (!open || mode !== "scan") return;
    function onVisible() {
      if (document.visibilityState === "visible") void loadDraft();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [open, mode, loadDraft]);

  function reset() {
    setInventoryItemId("");
    setQuantity("1");
    setReason("");
    setOccurredAt(defaultOccurredAt());
    setMarkDistributed(true);
    setRecipient(null);
    setError(null);
    setMode("pick");
    setConflictItemId(null);
    setSelectedEventId(eventId ?? null);
  }

  // In scan mode the recipient belongs to the server-side list, so an iPhone
  // tap that opens a new tab adds to the same person's handout.
  function saveRecipientToDraft(person: PickedPerson | null) {
    startTransition(async () => {
      const result = await setDistributionDraftRecipientAction(
        draftEventId,
        person?.id ?? null,
      );
      if ("error" in result) setError(result.error);
    });
  }

  function selectRecipient(person: PickedPerson | null) {
    setRecipient(person);
    if (mode === "scan") saveRecipientToDraft(person);
  }

  function selectEvent(nextEventId: string | null) {
    const previousEventId = selectedEventId;
    setSelectedEventId(nextEventId);
    if (!draft) return;
    // The list is kept per event, so it moves with the choice.
    startTransition(async () => {
      const moved = await moveDistributionDraftAction(
        previousEventId,
        nextEventId,
      );
      if ("error" in moved) {
        setError(moved.error);
        setSelectedEventId(previousEventId);
        return;
      }
      const result = await getDistributionDraftAction(nextEventId);
      if (!("error" in result)) setDraft(result.data);
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (mode === "scan") {
      startTransition(async () => {
        const result = await recordDistributionDraftAction({
          eventId: draftEventId,
          occurredAt: occurredAt
            ? new Date(occurredAt).toISOString()
            : undefined,
          reason,
          recipientPersonId: recipient?.id,
          markDistributed,
        });
        if ("error" in result) {
          setError(result.error);
          setConflictItemId(result.itemId ?? null);
          await loadDraft();
          return;
        }
        setDraft(null);
        handleOpenChange(false);
        toast.success(
          result.count === 1
            ? "Distribution recorded."
            : `${result.count} distributions recorded.`,
          removeTagsToast(result.releasedTags),
        );
        router.refresh();
        onSaved?.();
      });
      return;
    }

    const quantityNumber = Number(quantity);

    startTransition(async () => {
      const result = await recordEventDistributionAction({
        inventoryItemId,
        quantity: quantityNumber,
        reason,
        // Converted here, in the browser, so the recorded instant is fixed
        // using the user's own timezone rather than the server's.
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        markDistributed,
        eventId: selectedEventId ?? undefined,
        recipientPersonId: recipient?.id,
      });
      if ("error" in result) {
        setError(result.error.message);
        return;
      }
      handleOpenChange(false);
      toast.success(
        "Distribution recorded.",
        removeTagsToast(result.releasedTags),
      );
      router.refresh();
      onSaved?.();
    });
  }

  function clearList() {
    startTransition(async () => {
      const result = await discardDistributionDraftAction(draftEventId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDraft(null);
      setConflictItemId(null);
    });
  }

  const scannedCount = draft?.items.length ?? 0;

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      withTrigger={withTrigger}
      trigger={
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 whitespace-nowrap"
        >
          {triggerLabel}
        </Button>
      }
      title="Record a distribution"
      description="Record gear being handed out from inventory."
      onSubmit={handleSubmit}
      footer={
        <>
          {mode === "scan" && scannedCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              className="sm:mr-auto"
              disabled={isPending}
              onClick={clearList}
            >
              Clear list
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleOpenChange(false)}
          >
            {mode === "scan" && scannedCount > 0 ? "Close" : "Cancel"}
          </Button>
          <Button
            type="submit"
            disabled={isPending || (mode === "scan" && scannedCount === 0)}
          >
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : mode === "scan" ? (
              scannedCount === 1 ? (
                "Record 1 item"
              ) : (
                `Record ${scannedCount} items`
              )
            ) : (
              "Record distribution"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <RequiredFieldsNote />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setError(null);
              const nextMode = mode === "scan" ? "pick" : "scan";
              setMode(nextMode);
              if (nextMode === "scan" && recipient)
                saveRecipientToDraft(recipient);
            }}
          >
            {mode === "scan" ? <List /> : <ScanLine />}
            {mode === "scan" ? "Pick from a list" : "Scan tags"}
          </Button>
        </div>
        {mode === "scan" ? (
          <ScannedDistributionList
            eventId={draftEventId}
            draft={draft}
            recipientId={recipient?.id ?? null}
            availableItems={availableItems}
            conflictItemId={conflictItemId}
            releasesCodes={markDistributed}
            onChanged={async () => {
              setConflictItemId(null);
              await loadDraft();
            }}
          />
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="dist-item" required>
                Inventory item
              </FieldLabel>
              <Select
                value={inventoryItemId || null}
                onValueChange={(value) => setInventoryItemId(value ?? "")}
              >
                <SelectTrigger
                  id="dist-item"
                  aria-required="true"
                  className="w-full"
                >
                  <SelectValue placeholder="Select an available item">
                    {(value: string) => {
                      const item = availableItems.find(
                        (candidate) => candidate.id === value,
                      );
                      return item
                        ? `${item.description} (${categoryLabelFor(flattenCategory(item))})`
                        : "Select an available item";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {availableItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.description} (
                      {categoryLabelFor(flattenCategory(item))})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        )}

        <Field orientation="responsive">
          {mode === "pick" && (
            <Field>
              <FieldLabel htmlFor="dist-quantity" required>
                Quantity
              </FieldLabel>
              <Input
                id="dist-quantity"
                required
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="dist-occurredAt">Date &amp; time</FieldLabel>
            <Input
              id="dist-occurredAt"
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </Field>
        </Field>

        {eventOptions && (
          <Field>
            <FieldLabel htmlFor="dist-event">Event</FieldLabel>
            <Select
              value={selectedEventId ?? NO_EVENT}
              onValueChange={(value) =>
                selectEvent(value && value !== NO_EVENT ? value : null)
              }
            >
              <SelectTrigger id="dist-event" className="w-full">
                <SelectValue>
                  {(value: string) =>
                    eventOptions.find((option) => option.id === value)?.name ??
                    "No event"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_EVENT}>No event</SelectItem>
                {eventOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {showRecipientField && (
          <Field>
            <FieldLabel>Recipient</FieldLabel>
            <PersonPicker
              people={people}
              selected={recipient}
              onSelect={selectRecipient}
              onPersonCreated={(person) =>
                setPeople((prev) => [...prev, person])
              }
              placeholder="Search recipient by name or email..."
            />
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="dist-reason">Reason / notes</FieldLabel>
          <Textarea
            id="dist-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            id="dist-markDistributed"
            checked={markDistributed}
            onCheckedChange={(checked) => setMarkDistributed(Boolean(checked))}
          />
          <FieldLabel htmlFor="dist-markDistributed">
            Mark item as distributed
          </FieldLabel>
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}
