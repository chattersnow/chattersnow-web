"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDonationAction, type CreateDonationInput } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";

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

type Step = "donor" | "items";

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
  type: string;
  gender: string;
  condition: string;
  faceValue: string;
  notes: string;
};

function createEmptyItem(): ItemDraft {
  return {
    key: crypto.randomUUID(),
    description: "",
    size: "",
    type: "",
    gender: "",
    condition: "",
    faceValue: "",
    notes: "",
  };
}

export function AddDonationModal({
  triggerLabel = "Record donation",
  eventId,
  events,
  onSaved,
}: {
  triggerLabel?: string;
  eventId?: string;
  events?: { id: string; name: string }[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("donor");
  const [donor, setDonor] = useState<DonorState>(initialDonorState);
  const [items, setItems] = useState<ItemDraft[]>([createEmptyItem()]);
  const [sourceEventId, setSourceEventId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const showEventPicker = !eventId && !!events?.length;

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
        type: item.type,
        gender: item.gender || undefined,
        condition: item.condition,
        faceValue: item.faceValue ? Number(item.faceValue) : null,
        notes: item.notes || undefined,
      })),
      eventId: eventId ?? (sourceEventId || undefined),
    };

    startTransition(async () => {
      const result = await createDonationAction(payload);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={<Button type="button" className="shrink-0 whitespace-nowrap" />}
      >
        {triggerLabel}
      </SheetTrigger>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>Record a donation</SheetTitle>
          <SheetDescription>
            {step === "donor"
              ? "Capture who the donation is from."
              : "Add each item being added to inventory."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <p className="app-muted text-sm">
            {step === "donor"
              ? "Step 1 of 2 · Donor details"
              : "Step 2 of 2 · Donated items"}
          </p>

          <form id="add-donation-form" onSubmit={handleSubmit} className="mt-4">
            {step === "donor" ? (
              <FieldGroup>
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
                  <FieldLabel htmlFor="donorName">Donor name</FieldLabel>
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
                      Source event (optional)
                    </FieldLabel>
                    <Select
                      value={sourceEventId || null}
                      onValueChange={(value) => setSourceEventId(value ?? "")}
                    >
                      <SelectTrigger id="sourceEventId" className="w-full">
                        <SelectValue placeholder="No event">
                          {(value: string) =>
                            events?.find((event) => event.id === value)?.name ??
                            "No event"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {events?.map((event) => (
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
                      <FieldLabel htmlFor={`itemDescription-${item.key}`}>
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

                    <Field orientation="responsive">
                      <Field>
                        <FieldLabel htmlFor={`itemType-${item.key}`}>
                          Item type
                        </FieldLabel>
                        <Input
                          id={`itemType-${item.key}`}
                          required
                          placeholder="e.g. Jacket"
                          value={item.type}
                          onChange={(event) =>
                            updateItem(item.key, "type", event.target.value)
                          }
                        />
                      </Field>
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

        <SheetFooter className="flex-row justify-end border-t bg-muted/50">
          {step === "donor" ? (
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
