"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDonationAction } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

const initialFormState = {
  isAnonymous: false,
  donorName: "",
  donorEmail: "",
  donorPhone: "",
  sourceType: "",
  donorNotes: "",
  itemDescription: "",
  itemSize: "",
  itemType: "",
  itemGender: "",
  condition: "",
  faceValue: "",
  itemNotes: "",
};

export function AddDonationModal({
  triggerLabel = "Record donation",
}: {
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialFormState);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof typeof initialFormState>(
    key: K,
    value: (typeof initialFormState)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setForm(initialFormState);
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("isAnonymous", form.isAnonymous ? "on" : "off");
    formData.set("donorName", form.donorName);
    formData.set("donorEmail", form.donorEmail);
    formData.set("donorPhone", form.donorPhone);
    formData.set("sourceType", form.sourceType);
    formData.set("donorNotes", form.donorNotes);
    formData.set("itemDescription", form.itemDescription);
    formData.set("itemSize", form.itemSize);
    formData.set("itemType", form.itemType);
    formData.set("itemGender", form.itemGender);
    formData.set("condition", form.condition);
    formData.set("faceValue", form.faceValue);
    formData.set("itemNotes", form.itemNotes);

    startTransition(async () => {
      const result = await createDonationAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" className="shrink-0 whitespace-nowrap" />}
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a donation</DialogTitle>
          <DialogDescription>
            Capture the donor and the item being added to inventory.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field orientation="horizontal">
              <Checkbox
                id="isAnonymous"
                checked={form.isAnonymous}
                onCheckedChange={(checked) => update("isAnonymous", checked)}
              />
              <FieldLabel htmlFor="isAnonymous">Anonymous donor</FieldLabel>
            </Field>

            <Field>
              <FieldLabel htmlFor="donorName">Donor name</FieldLabel>
              <Input
                id="donorName"
                required={!form.isAnonymous}
                disabled={form.isAnonymous}
                value={form.donorName}
                onChange={(event) => update("donorName", event.target.value)}
              />
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="donorEmail">Donor email</FieldLabel>
                <Input
                  id="donorEmail"
                  type="email"
                  disabled={form.isAnonymous}
                  value={form.donorEmail}
                  onChange={(event) => update("donorEmail", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="donorPhone">Donor phone</FieldLabel>
                <Input
                  id="donorPhone"
                  type="tel"
                  disabled={form.isAnonymous}
                  value={form.donorPhone}
                  onChange={(event) => update("donorPhone", event.target.value)}
                />
              </Field>
            </Field>

            <Field>
              <FieldLabel htmlFor="sourceType">Donor source</FieldLabel>
              <Select
                value={form.sourceType || null}
                onValueChange={(value) => update("sourceType", value ?? "")}
              >
                <SelectTrigger id="sourceType" className="w-full">
                  <SelectValue placeholder="Select a source" />
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

            <Field>
              <FieldLabel htmlFor="donorNotes">Donor notes</FieldLabel>
              <Textarea
                id="donorNotes"
                value={form.donorNotes}
                onChange={(event) => update("donorNotes", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="itemDescription">Item description</FieldLabel>
              <Textarea
                id="itemDescription"
                required
                value={form.itemDescription}
                onChange={(event) => update("itemDescription", event.target.value)}
              />
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="itemType">Item type</FieldLabel>
                <Input
                  id="itemType"
                  required
                  placeholder="e.g. Jacket"
                  value={form.itemType}
                  onChange={(event) => update("itemType", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="itemSize">Size</FieldLabel>
                <Input
                  id="itemSize"
                  value={form.itemSize}
                  onChange={(event) => update("itemSize", event.target.value)}
                />
              </Field>
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="itemGender">Gender</FieldLabel>
                <Select
                  value={form.itemGender || null}
                  onValueChange={(value) => update("itemGender", value ?? "")}
                >
                  <SelectTrigger id="itemGender" className="w-full">
                    <SelectValue placeholder="Select a gender" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="condition">Condition</FieldLabel>
                <Select
                  value={form.condition || null}
                  onValueChange={(value) => update("condition", value ?? "")}
                >
                  <SelectTrigger id="condition" className="w-full">
                    <SelectValue placeholder="Select a condition" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </Field>

            <Field>
              <FieldLabel htmlFor="faceValue">Face value ($)</FieldLabel>
              <Input
                id="faceValue"
                type="number"
                min="0"
                step="0.01"
                value={form.faceValue}
                onChange={(event) => update("faceValue", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="itemNotes">Item notes</FieldLabel>
              <Textarea
                id="itemNotes"
                value={form.itemNotes}
                onChange={(event) => update("itemNotes", event.target.value)}
              />
            </Field>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save donation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
