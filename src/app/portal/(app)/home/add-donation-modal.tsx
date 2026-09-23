"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Printer, ScanLine } from "lucide-react";
import {
  createDonationAction,
  listEventGiveawayTiersAction,
  type CreateDonationInput,
  type DonationGiveawayGrant,
  type GiveawayTierOption,
} from "./actions";
import { classifyIntakeScanAction } from "./intake-scan-actions";
import type { ReceivedItemCode } from "./donation-core";
import { GiveawayTicketSummary } from "./giveaway-ticket-summary";
import { TagScanner } from "@/components/portal/tag-scanner";
import { listEventOptionsAction } from "../events/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { INTENDED_USES, type InventoryCategory } from "@/lib/inventory";
import { todayInBrowser } from "@/lib/time";
import { CategorySelect } from "@/components/portal/category-select";
import { PhotoUploadField } from "@/components/portal/photo-upload-field";
import { listInventoryCategoriesAction } from "../inventory/categories/actions";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import {
  useControlledOpen,
  type ControlledOpenProps,
} from "@/components/portal/use-controlled-open";

const SOURCE_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "brand", label: "Brand" },
  { value: "organization", label: "Organization" },
  { value: "event", label: "Event" },
  { value: "other", label: "Other" },
];

const GENDERS = [
  { value: "unisex", label: "Unisex" },
  { value: "men", label: "Men" },
  { value: "women", label: "Women" },
  { value: "kids", label: "Kids" },
  { value: "other", label: "Other" },
];

const CONDITIONS = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like new" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

// "saved" is the terminal step: every received item has a code to label it
// with (#1420), and, when the donation was recorded against an event whose
// giveaway has tiers configured, tickets to hand over (issue #5).
type Step = "donor" | "items" | "saved";

type SavedDonation = {
  codes: (ReceivedItemCode & { description: string })[];
  labelsHref: string | null;
};

const initialDonorState = {
  isAnonymous: false,
  donorName: "",
  donorEmail: "",
  donorPhone: "",
  sourceType: "",
  donorNotes: "",
};

type DonorState = typeof initialDonorState;

type ItemDraft = {
  key: string;
  description: string;
  size: string;
  categoryId: string;
  categoryDetail: string;
  gender: string;
  condition: string;
  faceValue: string;
  notes: string;
  intendedUse: string;
  giveawayTier: string;
  photoUrl: string;
  /** A pre-printed blank label scanned for this item (#1420). */
  assetTag: string;
  /** A manufacturer barcode scanned off it. */
  barcode: string;
};

function createEmptyItem(assetTag = ""): ItemDraft {
  return {
    key: crypto.randomUUID(),
    description: "",
    size: "",
    categoryId: "",
    categoryDetail: "",
    gender: "",
    condition: "",
    faceValue: "",
    notes: "",
    intendedUse: "gear_library",
    giveawayTier: "",
    photoUrl: "",
    assetTag,
    barcode: "",
  };
}

export function AddDonationModal({
  triggerLabel = "Record donation",
  open: controlledOpen,
  onOpenChange,
  withTrigger = true,
  eventId,
  events,
  onSaved,
  initialAssetTag,
}: {
  triggerLabel?: string;
  eventId?: string;
  events?: { id: string; name: string }[];
  onSaved?: () => void;
  /** A blank label to receive a donation with (#1420): opens the sheet with
   *  it on the first item. The /portal/t resolver links here with one. */
  initialAssetTag?: string;
} & ControlledOpenProps) {
  const router = useRouter();
  const [open, setOpen] = useControlledOpen(
    controlledOpen,
    onOpenChange,
    Boolean(initialAssetTag),
  );
  const [step, setStep] = useState<Step>("donor");
  const [donor, setDonor] = useState<DonorState>(initialDonorState);
  const [items, setItems] = useState<ItemDraft[]>(() => [
    createEmptyItem(initialAssetTag),
  ]);
  const [scanningKey, setScanningKey] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [isScanPending, startScanTransition] = useTransition();
  const [saved, setSaved] = useState<SavedDonation | null>(null);
  const [sourceEventId, setSourceEventId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [giveawayTiers, setGiveawayTiers] = useState<GiveawayTierOption[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [grant, setGrant] = useState<DonationGiveawayGrant | null>(null);
  // Callers on a page that already queried events pass them in; the sidebar
  // quick action has none, so load them on open instead of silently dropping
  // the event picker.
  const [loadedEvents, setLoadedEvents] = useState<
    { id: string; name: string }[]
  >([]);
  const eventOptions = events ?? loadedEvents;
  const showEventPicker = !eventId && !!eventOptions.length;
  const selectedEventId = eventId ?? sourceEventId;

  useEffect(() => {
    if (!open || eventId || events) return;
    listEventOptionsAction().then((result) => {
      if (!("error" in result)) setLoadedEvents(result.data);
    });
  }, [open, eventId, events]);

  // This modal is opened from client components (the sidebar quick actions and
  // the active-event card), so the vocabulary can't arrive as a server prop the
  // way it does on the items page -- same reason the two lookups above are
  // fetched here.
  useEffect(() => {
    if (!open) return;
    listInventoryCategoriesAction().then((result) => {
      if (!("error" in result)) setCategories(result.data);
    });
  }, [open]);

  // An event with no giveaway, or a giveaway with no tiers, returns an empty
  // list and the per-item tier picker stays hidden.
  useEffect(() => {
    if (!open || !selectedEventId) return;
    let active = true;
    listEventGiveawayTiersAction(selectedEventId).then((result) => {
      if (!active) return;
      setGiveawayTiers("error" in result ? [] : result.data);
    });
    return () => {
      active = false;
    };
  }, [open, selectedEventId]);

  function updateDonor<K extends keyof DonorState>(
    key: K,
    value: DonorState[K],
  ) {
    setDonor((prev) => ({ ...prev, [key]: value }));
  }

  function updateItem<K extends keyof ItemDraft>(
    itemKey: string,
    key: K,
    value: ItemDraft[K],
  ) {
    setItems((prev) =>
      prev.map((item) =>
        item.key === itemKey ? { ...item, [key]: value } : item,
      ),
    );
  }

  function toggleScanner(itemKey: string) {
    setScanMessage(null);
    setScanningKey((current) => (current === itemKey ? null : itemKey));
  }

  // A scan fills in what it identifies and never overwrites what the staffer
  // already typed: a barcode prefills a second pair of the same gloves, it
  // does not rename the first.
  function handleIntakeScan(itemKey: string, scanned: string) {
    setScanMessage(null);
    startScanTransition(async () => {
      const result = await classifyIntakeScanAction(scanned);
      if ("error" in result) {
        setScanMessage(result.error);
        return;
      }
      const scan = result.data;
      if (
        scan.kind === "asset_tag" &&
        items.some(
          (other) => other.key !== itemKey && other.assetTag === scan.code,
        )
      ) {
        setScanMessage(`Label ${scan.code} is already on another item here.`);
        return;
      }
      setItems((prev) =>
        prev.map((item) => {
          if (item.key !== itemKey) return item;
          if (scan.kind === "asset_tag")
            return { ...item, assetTag: scan.code };
          const categoryId =
            item.categoryId ||
            categories.find(
              (category) => category.key === scan.prefill?.categoryKey,
            )?.id ||
            "";
          return {
            ...item,
            barcode: scan.value,
            description: item.description || scan.prefill?.description || "",
            categoryId,
          };
        }),
      );
      setScanningKey(null);
    });
  }

  function addItem() {
    setItems((prev) => [...prev, createEmptyItem()]);
  }

  function removeItem(itemKey: string) {
    setItems((prev) =>
      prev.length > 1 ? prev.filter((item) => item.key !== itemKey) : prev,
    );
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setStep("donor");
      setDonor(initialDonorState);
      setItems([createEmptyItem()]);
      setSourceEventId("");
      setError(null);
      setGiveawayTiers([]);
      setGrant(null);
      setSaved(null);
      setScanningKey(null);
      setScanMessage(null);
    }
  }

  function handleContinue() {
    if (!donor.isAnonymous && !donor.donorName.trim()) {
      setError("Donor name is required unless the donation is anonymous.");
      return;
    }
    if (!donor.sourceType) {
      setError("Select a donor source.");
      return;
    }
    setError(null);
    setStep("items");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const payload: CreateDonationInput = {
      isAnonymous: donor.isAnonymous,
      donorName: donor.donorName,
      donorEmail: donor.donorEmail,
      donorPhone: donor.donorPhone,
      sourceType: donor.sourceType,
      donorNotes: donor.donorNotes,
      items: items.map((item) => ({
        description: item.description,
        size: item.size || undefined,
        categoryKey:
          categories.find((category) => category.id === item.categoryId)?.key ??
          "",
        categoryDetail: item.categoryDetail || undefined,
        gender: item.gender || undefined,
        condition: item.condition,
        faceValue: item.faceValue ? Number(item.faceValue) : null,
        notes: item.notes || undefined,
        intendedUse: item.intendedUse,
        giveawayTier: item.giveawayTier || undefined,
        photoUrl: item.photoUrl || undefined,
        assetTag: item.assetTag || undefined,
        barcode: item.barcode || undefined,
      })),
      eventId: eventId ?? (sourceEventId || undefined),
      // The staffer's own day, not the server's. Gear arrives at an event,
      // after dark, which on a UTC server is already tomorrow (#1053).
      donatedOn: todayInBrowser(),
    };

    startTransition(async () => {
      const result = await createDonationAction(payload);
      if ("error" in result) {
        setError(result.error.message);
        return;
      }
      router.refresh();
      onSaved?.();

      // Codes and tickets are both things to act on at the table -- a label to
      // stick on each item, tickets to hand over -- so the sheet stays open on
      // them rather than closing behind a toast.
      const descriptions = new Map<string, string>();
      payload.items.forEach((item, index) => {
        const itemId = result.codes[index]?.itemId;
        if (itemId) descriptions.set(itemId, item.description.trim());
      });
      setSaved({
        codes: result.codes.map((code) => ({
          ...code,
          description: descriptions.get(code.itemId) ?? "",
        })),
        labelsHref: result.labelsHref ?? null,
      });
      setGrant(result.giveaway);
      setStep("saved");
      toast.success("Gear donation recorded.");
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {withTrigger ? (
        <SheetTrigger
          render={
            <Button type="button" className="shrink-0 whitespace-nowrap" />
          }
        >
          {triggerLabel}
        </SheetTrigger>
      ) : null}
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>Record a donation</SheetTitle>
          <SheetDescription>
            {step === "donor"
              ? "Capture who the donation is from."
              : step === "items"
                ? "Add each item being added to inventory."
                : grant
                  ? "The donation is saved. Label each item and hand over the tickets below."
                  : "The donation is saved. Label each item with its code."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <p className="app-muted text-sm">
            {step === "donor"
              ? "Step 1 of 2 · Donor details"
              : step === "items"
                ? "Step 2 of 2 · Donated items"
                : "Donation recorded"}
          </p>

          {step === "saved" && saved && saved.codes.length > 0 && (
            <div className="mt-4 flex flex-col gap-3">
              <h3 className="text-sm font-medium">Item codes</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {saved.codes.map((code) => (
                  <li key={code.itemId} className="flex gap-3">
                    <span className="font-mono font-semibold tracking-wider">
                      {code.code}
                    </span>
                    <span className="min-w-0 truncate">{code.description}</span>
                  </li>
                ))}
              </ul>
              {saved.labelsHref && (
                <Button
                  variant="secondary"
                  className="self-start"
                  nativeButton={false}
                  render={
                    <Link
                      href={saved.labelsHref}
                      onClick={() => handleOpenChange(false)}
                    />
                  }
                >
                  <Printer /> Print{" "}
                  {saved.codes.length === 1
                    ? "label"
                    : `${saved.codes.length} labels`}
                </Button>
              )}
            </div>
          )}

          {step === "saved" && grant && (
            <div className="mt-4">
              <GiveawayTicketSummary
                grant={grant}
                untieredCount={grant.untieredItemIds.length}
              />
            </div>
          )}

          <form
            id="add-donation-form"
            onSubmit={handleSubmit}
            className="mt-4"
            hidden={step === "saved"}
          >
            {step === "donor" ? (
              <FieldGroup>
                <RequiredFieldsNote />
                <Field orientation="horizontal">
                  <Checkbox
                    id="isAnonymous"
                    checked={donor.isAnonymous}
                    onCheckedChange={(checked) =>
                      updateDonor("isAnonymous", Boolean(checked))
                    }
                  />
                  <FieldLabel htmlFor="isAnonymous">Anonymous donor</FieldLabel>
                </Field>

                <Field>
                  <FieldLabel htmlFor="donorName" required={!donor.isAnonymous}>
                    Donor name
                  </FieldLabel>
                  <Input
                    id="donorName"
                    required={!donor.isAnonymous}
                    disabled={donor.isAnonymous}
                    value={donor.donorName}
                    onChange={(event) =>
                      updateDonor("donorName", event.target.value)
                    }
                  />
                </Field>

                <Field orientation="responsive">
                  <Field>
                    <FieldLabel htmlFor="donorEmail">Donor email</FieldLabel>
                    <Input
                      id="donorEmail"
                      type="email"
                      disabled={donor.isAnonymous}
                      value={donor.donorEmail}
                      onChange={(event) =>
                        updateDonor("donorEmail", event.target.value)
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="donorPhone">Donor phone</FieldLabel>
                    <Input
                      id="donorPhone"
                      type="tel"
                      disabled={donor.isAnonymous}
                      value={donor.donorPhone}
                      onChange={(event) =>
                        updateDonor("donorPhone", event.target.value)
                      }
                    />
                  </Field>
                </Field>

                <Field>
                  <FieldLabel htmlFor="sourceType">Donor source</FieldLabel>
                  <Select
                    value={donor.sourceType || null}
                    onValueChange={(value) =>
                      updateDonor("sourceType", value ?? "")
                    }
                  >
                    <SelectTrigger id="sourceType" className="w-full">
                      <SelectValue placeholder="Select a source">
                        {(value: string) =>
                          SOURCE_TYPES.find((option) => option.value === value)
                            ?.label ?? "Select a source"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_TYPES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                {showEventPicker && (
                  <Field>
                    <FieldLabel htmlFor="sourceEventId">
                      Source event
                    </FieldLabel>
                    <Select
                      value={sourceEventId || null}
                      onValueChange={(value) => {
                        setSourceEventId(value ?? "");
                        // Tiers belong to the previous event's giveaway; drop
                        // them so the picker can't offer stale options while
                        // the new event's tiers load.
                        setGiveawayTiers([]);
                      }}
                    >
                      <SelectTrigger id="sourceEventId" className="w-full">
                        <SelectValue placeholder="No event">
                          {(value: string) =>
                            eventOptions.find((event) => event.id === value)
                              ?.name ?? "No event"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {eventOptions.map((event) => (
                          <SelectItem key={event.id} value={event.id}>
                            {event.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}

                <Field>
                  <FieldLabel htmlFor="donorNotes">Donor notes</FieldLabel>
                  <Textarea
                    id="donorNotes"
                    value={donor.donorNotes}
                    onChange={(event) =>
                      updateDonor("donorNotes", event.target.value)
                    }
                  />
                </Field>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </FieldGroup>
            ) : (
              <FieldGroup>
                {items.map((item, index) => (
                  <FieldGroup
                    key={item.key}
                    className="rounded-md border border-[var(--line)] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <FieldLabel className="text-sm font-medium">
                        Item {index + 1}
                      </FieldLabel>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={items.length === 1}
                        onClick={() => removeItem(item.key)}
                      >
                        Remove
                      </Button>
                    </div>

                    <Field>
                      <FieldLabel
                        htmlFor={`itemDescription-${item.key}`}
                        required
                      >
                        Item description
                      </FieldLabel>
                      <Textarea
                        id={`itemDescription-${item.key}`}
                        required
                        value={item.description}
                        onChange={(event) =>
                          updateItem(
                            item.key,
                            "description",
                            event.target.value,
                          )
                        }
                      />
                    </Field>

                    <Field>
                      {/* Not a <label>: the scanner below has its own, and
                          is mounted only while scanning. */}
                      <p className="text-sm font-medium">Label and barcode</p>
                      <FieldDescription>
                        {item.assetTag
                          ? `Pre-printed label ${item.assetTag}.`
                          : "A new code is created when you save."}
                        {item.barcode ? ` Barcode ${item.barcode}.` : ""}
                      </FieldDescription>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          aria-expanded={scanningKey === item.key}
                          onClick={() => toggleScanner(item.key)}
                        >
                          <ScanLine />
                          {scanningKey === item.key
                            ? "Stop scanning"
                            : "Scan label or barcode"}
                        </Button>
                        {item.assetTag && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => updateItem(item.key, "assetTag", "")}
                          >
                            Clear label
                          </Button>
                        )}
                        {item.barcode && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => updateItem(item.key, "barcode", "")}
                          >
                            Clear barcode
                          </Button>
                        )}
                      </div>
                      {/* Mounted only while open, so closing stops the camera. */}
                      {scanningKey === item.key && (
                        <>
                          <TagScanner
                            onScan={(scanned) =>
                              handleIntakeScan(item.key, scanned)
                            }
                            busy={isScanPending}
                            idPrefix={`intake-${item.key}`}
                          />
                          <div aria-live="polite">
                            {scanMessage && (
                              <Alert variant="destructive">
                                <AlertDescription>
                                  {scanMessage}
                                </AlertDescription>
                              </Alert>
                            )}
                          </div>
                        </>
                      )}
                    </Field>

                    <Field orientation="responsive">
                      <CategorySelect
                        categories={categories}
                        categoryId={item.categoryId}
                        detail={item.categoryDetail}
                        idPrefix={`item-${item.key}`}
                        onCategoryChange={(value) =>
                          updateItem(item.key, "categoryId", value)
                        }
                        onDetailChange={(value) =>
                          updateItem(item.key, "categoryDetail", value)
                        }
                      />
                      <Field>
                        <FieldLabel htmlFor={`itemSize-${item.key}`}>
                          Size
                        </FieldLabel>
                        <Input
                          id={`itemSize-${item.key}`}
                          value={item.size}
                          onChange={(event) =>
                            updateItem(item.key, "size", event.target.value)
                          }
                        />
                      </Field>
                    </Field>

                    <Field orientation="responsive">
                      <Field>
                        <FieldLabel htmlFor={`itemGender-${item.key}`}>
                          Gender
                        </FieldLabel>
                        <Select
                          value={item.gender || null}
                          onValueChange={(value) =>
                            updateItem(item.key, "gender", value ?? "")
                          }
                        >
                          <SelectTrigger
                            id={`itemGender-${item.key}`}
                            className="w-full"
                          >
                            <SelectValue placeholder="Select a gender">
                              {(value: string) =>
                                GENDERS.find((option) => option.value === value)
                                  ?.label ?? "Select a gender"
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {GENDERS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`condition-${item.key}`}>
                          Condition
                        </FieldLabel>
                        <Select
                          value={item.condition || null}
                          onValueChange={(value) =>
                            updateItem(item.key, "condition", value ?? "")
                          }
                        >
                          <SelectTrigger
                            id={`condition-${item.key}`}
                            className="w-full"
                          >
                            <SelectValue placeholder="Select a condition">
                              {(value: string) =>
                                CONDITIONS.find(
                                  (option) => option.value === value,
                                )?.label ?? "Select a condition"
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor={`faceValue-${item.key}`}>
                        Face value ($)
                      </FieldLabel>
                      <Input
                        id={`faceValue-${item.key}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.faceValue}
                        onChange={(event) =>
                          updateItem(item.key, "faceValue", event.target.value)
                        }
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor={`intendedUse-${item.key}`}>
                        Intended use
                      </FieldLabel>
                      <Select
                        value={item.intendedUse || null}
                        onValueChange={(value) =>
                          updateItem(item.key, "intendedUse", value ?? "")
                        }
                      >
                        <SelectTrigger
                          id={`intendedUse-${item.key}`}
                          className="w-full"
                        >
                          <SelectValue placeholder="Select an intended use">
                            {(value: string) =>
                              INTENDED_USES.find(
                                (option) => option.value === value,
                              )?.label ?? "Select an intended use"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {INTENDED_USES.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        Gear library items go on the public gear library. Choose
                        giveaway for prize stock like vouchers or gift cards.
                      </FieldDescription>
                    </Field>

                    {giveawayTiers.length > 0 && (
                      <Field>
                        <FieldLabel htmlFor={`giveawayTier-${item.key}`}>
                          Giveaway tier
                        </FieldLabel>
                        <Select
                          value={item.giveawayTier || null}
                          onValueChange={(value) =>
                            updateItem(item.key, "giveawayTier", value ?? "")
                          }
                        >
                          <SelectTrigger
                            id={`giveawayTier-${item.key}`}
                            className="w-full"
                          >
                            <SelectValue placeholder="Match on item type">
                              {(value: string) =>
                                giveawayTiers.find((tier) => tier.key === value)
                                  ?.label ?? "Match on item type"
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {giveawayTiers.map((tier) => (
                              <SelectItem key={tier.id} value={tier.key}>
                                {tier.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldDescription>
                          Sets how many tickets this item earns. Left unset, the
                          tier is matched from the item type.
                        </FieldDescription>
                      </Field>
                    )}

                    <Field>
                      <FieldLabel htmlFor={`itemNotes-${item.key}`}>
                        Item notes
                      </FieldLabel>
                      <Textarea
                        id={`itemNotes-${item.key}`}
                        value={item.notes}
                        onChange={(event) =>
                          updateItem(item.key, "notes", event.target.value)
                        }
                      />
                    </Field>

                    <PhotoUploadField
                      idPrefix={`item-${item.key}`}
                      value={item.photoUrl}
                      onChange={(url) => updateItem(item.key, "photoUrl", url)}
                    />
                  </FieldGroup>
                ))}

                <Button type="button" variant="secondary" onClick={addItem}>
                  + Add another item
                </Button>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </FieldGroup>
            )}
          </form>
        </div>

        <SheetFooter>
          {step === "saved" ? (
            <Button type="button" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          ) : step === "donor" ? (
            <Button type="button" onClick={handleContinue}>
              Continue
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep("donor")}
              >
                Back
              </Button>
              <Button
                type="submit"
                form="add-donation-form"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Spinner /> Saving...
                  </>
                ) : (
                  "Save donation"
                )}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
