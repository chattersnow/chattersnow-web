"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import {
  createEventSponsorAction,
  deleteEventSponsorAction,
  listEventSponsorsAction,
  updateEventSponsorAction,
  type EventSponsor,
} from "./sponsors-actions";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const SUPPORT_TYPES = [
  { value: "cash", label: "Cash" },
  { value: "in_kind", label: "In-kind" },
  { value: "both", label: "Cash + in-kind" },
  { value: "other", label: "Other" },
];

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatValue(value: number | string | null) {
  if (value === null || value === undefined) return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? currencyFormatter.format(numeric) : "—";
}

type SponsorFormState = {
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  supportType: string;
  inKindDescription: string;
  contributionValue: string;
  isPublic: boolean;
  notes: string;
};

function emptySponsorForm(): SponsorFormState {
  return {
    name: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    supportType: "in_kind",
    inKindDescription: "",
    contributionValue: "",
    isPublic: false,
    notes: "",
  };
}

function formStateFor(sponsor: EventSponsor): SponsorFormState {
  return {
    name: sponsor.name,
    contactName: sponsor.contact_name ?? "",
    contactEmail: sponsor.contact_email ?? "",
    contactPhone: sponsor.contact_phone ?? "",
    supportType: sponsor.support_type,
    inKindDescription: sponsor.in_kind_description ?? "",
    contributionValue: sponsor.contribution_value === null ? "" : String(sponsor.contribution_value),
    isPublic: sponsor.is_public,
    notes: sponsor.notes ?? "",
  };
}

function SponsorForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: SponsorFormState;
  submitLabel: string;
  onSubmit: (formData: FormData) => Promise<{ error: string } | { success: true }>;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof SponsorFormState>(key: K, value: SponsorFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", form.name);
    formData.set("contactName", form.contactName);
    formData.set("contactEmail", form.contactEmail);
    formData.set("contactPhone", form.contactPhone);
    formData.set("supportType", form.supportType);
    formData.set("inKindDescription", form.inKindDescription);
    formData.set("contributionValue", form.contributionValue);
    formData.set("isPublic", form.isPublic ? "on" : "off");
    formData.set("notes", form.notes);

    startTransition(async () => {
      const result = await onSubmit(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onCancel?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-[var(--line)] p-4">
      <FieldGroup>
        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="sponsor-name">Sponsor / partner name</FieldLabel>
            <Input
              id="sponsor-name"
              required
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="sponsor-supportType">Support type</FieldLabel>
            <Select value={form.supportType} onValueChange={(value) => update("supportType", value ?? "in_kind")}>
              <SelectTrigger id="sponsor-supportType" className="w-full">
                <SelectValue placeholder="Select support type">
                  {(value: string) => SUPPORT_TYPES.find((option) => option.value === value)?.label ?? "Select support type"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SUPPORT_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="sponsor-contactName">Contact name</FieldLabel>
            <Input
              id="sponsor-contactName"
              value={form.contactName}
              onChange={(event) => update("contactName", event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="sponsor-contributionValue">Contribution value ($)</FieldLabel>
            <Input
              id="sponsor-contributionValue"
              type="number"
              min="0"
              step="0.01"
              value={form.contributionValue}
              onChange={(event) => update("contributionValue", event.target.value)}
            />
          </Field>
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="sponsor-contactEmail">Contact email</FieldLabel>
            <Input
              id="sponsor-contactEmail"
              type="email"
              value={form.contactEmail}
              onChange={(event) => update("contactEmail", event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="sponsor-contactPhone">Contact phone</FieldLabel>
            <Input
              id="sponsor-contactPhone"
              type="tel"
              value={form.contactPhone}
              onChange={(event) => update("contactPhone", event.target.value)}
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="sponsor-inKindDescription">In-kind support description</FieldLabel>
          <Textarea
            id="sponsor-inKindDescription"
            placeholder="e.g. Donated 200 pairs of gloves, printing services, venue discount"
            value={form.inKindDescription}
            onChange={(event) => update("inKindDescription", event.target.value)}
          />
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            id="sponsor-isPublic"
            checked={form.isPublic}
            onCheckedChange={(checked) => update("isPublic", Boolean(checked))}
          />
          <FieldLabel htmlFor="sponsor-isPublic">Show on the public event page</FieldLabel>
        </Field>

        <Field>
          <FieldLabel htmlFor="sponsor-notes">Notes</FieldLabel>
          <Textarea
            id="sponsor-notes"
            value={form.notes}
            onChange={(event) => update("notes", event.target.value)}
          />
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
            {isPending ? "Saving..." : submitLabel}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function SponsorsTab({ eventId, active }: { eventId: string; active: boolean }) {
  const router = useRouter();
  const [sponsors, setSponsors] = useState<EventSponsor[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    listEventSponsorsAction(eventId).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setLoadError(result.error);
      } else {
        setLoadError(null);
        setSponsors(result.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [active, eventId]);

  function refresh() {
    listEventSponsorsAction(eventId).then((result) => {
      if ("error" in result) {
        setLoadError(result.error);
      } else {
        setLoadError(null);
        setSponsors(result.data);
      }
    });
    router.refresh();
  }

  function handleDelete(id: string) {
    startDeleteTransition(async () => {
      await deleteEventSponsorAction(id);
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {sponsors === null ? (
        <p className="app-muted text-sm">Loading sponsors...</p>
      ) : sponsors.length === 0 && !showAdd ? (
        <p className="app-muted text-sm">No sponsors or partners recorded yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sponsor</TableHead>
              <TableHead>Support</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Public</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sponsors?.map((sponsor) =>
              editingId === sponsor.id ? (
                <TableRow key={sponsor.id}>
                  <TableCell colSpan={5}>
                    <SponsorForm
                      initial={formStateFor(sponsor)}
                      submitLabel="Save sponsor"
                      onSubmit={(formData) => updateEventSponsorAction(sponsor.id, formData)}
                      onCancel={() => {
                        setEditingId(null);
                        refresh();
                      }}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={sponsor.id}>
                  <TableCell className="font-medium">{sponsor.name}</TableCell>
                  <TableCell className="app-muted capitalize">
                    {sponsor.support_type.replace("_", " ")}
                  </TableCell>
                  <TableCell>{formatValue(sponsor.contribution_value)}</TableCell>
                  <TableCell className="app-muted">{sponsor.is_public ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit sponsor"
                      onClick={() => setEditingId(sponsor.id)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove sponsor"
                      disabled={isDeleting}
                      onClick={() => handleDelete(sponsor.id)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            )}
          </TableBody>
        </Table>
      )}

      {showAdd ? (
        <SponsorForm
          initial={emptySponsorForm()}
          submitLabel="Add sponsor"
          onSubmit={(formData) => createEventSponsorAction(eventId, formData)}
          onCancel={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      ) : (
        <Button type="button" variant="outline" onClick={() => setShowAdd(true)}>
          + Add sponsor
        </Button>
      )}
    </div>
  );
}
