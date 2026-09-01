"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import {
  deleteEventSponsorAction,
  listEventSponsorsAction,
  updateEventSponsorAction,
  type EventSponsor,
  type EventSponsorPerson,
  type SponsorActionResult,
} from "./sponsors-actions";
import { PersonPicker, type PickedPerson } from "../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../people/actions";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useResetOnModeChange, useTabData } from "@/hooks/use-tab-data";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
import { Spinner } from "@/components/ui/spinner";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";

const SUPPORT_TYPES = [
  { value: "cash", label: "Cash" },
  { value: "in_kind", label: "In-kind" },
  { value: "both", label: "Cash + in-kind" },
  { value: "other", label: "Other" },
];

const FOLLOW_UP_STATUSES = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatValue(value: number | string | null) {
  if (value === null || value === undefined) return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? currencyFormatter.format(numeric) : "—";
}

export type SponsorFormState = {
  supportType: string;
  inKindDescription: string;
  contributionValue: string;
  isPublic: boolean;
  notes: string;
  followUpStatus: string;
  followUpNotes: string;
};

export function emptySponsorForm(): SponsorFormState {
  return {
    supportType: "in_kind",
    inKindDescription: "",
    contributionValue: "",
    isPublic: false,
    notes: "",
    followUpStatus: "not_started",
    followUpNotes: "",
  };
}

function formStateFor(sponsor: EventSponsor): SponsorFormState {
  return {
    supportType: sponsor.support_type,
    inKindDescription: sponsor.in_kind_description ?? "",
    contributionValue:
      sponsor.contribution_value === null
        ? ""
        : String(sponsor.contribution_value),
    isPublic: sponsor.is_public,
    notes: sponsor.notes ?? "",
    followUpStatus: sponsor.follow_up_status,
    followUpNotes: sponsor.follow_up_notes ?? "",
  };
}

export function SponsorForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  people,
  onPersonCreated,
  personDisplay,
}: {
  initial: SponsorFormState;
  submitLabel: string;
  onSubmit: (
    formData: FormData,
    personId: string | null,
  ) => Promise<SponsorActionResult>;
  onCancel?: () => void;
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  personDisplay?: EventSponsorPerson;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    personDisplay ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof SponsorFormState>(
    key: K,
    value: SponsorFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!personDisplay && !selectedPerson) {
      setError("Select or create a person to link.");
      return;
    }

    const formData = new FormData();
    formData.set("supportType", form.supportType);
    formData.set("inKindDescription", form.inKindDescription);
    formData.set("contributionValue", form.contributionValue);
    formData.set("isPublic", form.isPublic ? "on" : "off");
    formData.set("notes", form.notes);
    formData.set("followUpStatus", form.followUpStatus);
    formData.set("followUpNotes", form.followUpNotes);

    startTransition(async () => {
      const result = await onSubmit(formData, selectedPerson?.id ?? null);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onCancel?.();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        {personDisplay ? (
          <Field>
            <FieldLabel>Sponsor / partner</FieldLabel>
            <div className="rounded-md border border-[var(--line)] px-3 py-2">
              <p className="text-sm font-medium">{personDisplay.name ?? "—"}</p>
              {personDisplay.email && (
                <p className="app-muted text-xs">{personDisplay.email}</p>
              )}
            </div>
          </Field>
        ) : (
          <Field>
            <FieldLabel>Sponsor / partner</FieldLabel>
            <PersonPicker
              people={people}
              selected={selectedPerson}
              onSelect={setSelectedPerson}
              onPersonCreated={onPersonCreated}
              newPersonRole="is_sponsor"
            />
          </Field>
        )}

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="sponsor-supportType">Support type</FieldLabel>
            <Select
              value={form.supportType}
              onValueChange={(value) =>
                update("supportType", value ?? "in_kind")
              }
            >
              <SelectTrigger id="sponsor-supportType" className="w-full">
                <SelectValue placeholder="Select support type">
                  {(value: string) =>
                    SUPPORT_TYPES.find((option) => option.value === value)
                      ?.label ?? "Select support type"
                  }
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
          <Field>
            <FieldLabel htmlFor="sponsor-contributionValue">
              Contribution value ($)
            </FieldLabel>
            <Input
              id="sponsor-contributionValue"
              type="number"
              min="0"
              step="0.01"
              value={form.contributionValue}
              onChange={(event) =>
                update("contributionValue", event.target.value)
              }
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="sponsor-inKindDescription">
            In-kind support description
          </FieldLabel>
          <Textarea
            id="sponsor-inKindDescription"
            placeholder="e.g. Donated 200 pairs of gloves, printing services, venue discount"
            value={form.inKindDescription}
            onChange={(event) =>
              update("inKindDescription", event.target.value)
            }
          />
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            id="sponsor-isPublic"
            checked={form.isPublic}
            onCheckedChange={(checked) => update("isPublic", Boolean(checked))}
          />
          <FieldLabel htmlFor="sponsor-isPublic">
            Show on the public event page
          </FieldLabel>
        </Field>

        <Field>
          <FieldLabel htmlFor="sponsor-notes">Notes</FieldLabel>
          <Textarea
            id="sponsor-notes"
            value={form.notes}
            onChange={(event) => update("notes", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="sponsor-followUpStatus">
            Partner follow-up
          </FieldLabel>
          <Select
            value={form.followUpStatus}
            onValueChange={(value) =>
              update("followUpStatus", value ?? "not_started")
            }
          >
            <SelectTrigger id="sponsor-followUpStatus" className="w-full">
              <SelectValue placeholder="Select follow-up status">
                {(value: string) =>
                  FOLLOW_UP_STATUSES.find((option) => option.value === value)
                    ?.label ?? "Select follow-up status"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FOLLOW_UP_STATUSES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="sponsor-followUpNotes">
            Follow-up notes
          </FieldLabel>
          <Textarea
            id="sponsor-followUpNotes"
            value={form.followUpNotes}
            onChange={(event) => update("followUpNotes", event.target.value)}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function SponsorsTab({
  eventId,
  active,
  mode,
}: {
  eventId: string;
  active: boolean;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const {
    data: sponsors,
    loadError,
    refresh: refreshSponsors,
  } = useTabData<EventSponsor[]>(
    () => listEventSponsorsAction(eventId),
    active,
    [eventId],
  );
  const { data: peopleData, refresh: refreshPeople } = useTabData<
    PersonListItem[]
  >(() => listPeopleAction(), active, [eventId]);
  const [newPeople, setNewPeople] = useState<PersonListItem[]>([]);
  const people = [...(peopleData ?? []), ...newPeople];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  useResetOnModeChange(mode, () => {
    setEditingId(null);
  });

  function refresh() {
    refreshSponsors();
    refreshPeople();
    router.refresh();
  }

  useRegisterTabRefresh<TabValue>("sponsors", refresh);

  function handlePersonCreated(person: PickedPerson) {
    setNewPeople((prev) => [...prev, { ...person, is_sponsor: true }]);
  }

  function handleDelete(id: string) {
    startDeleteTransition(async () => {
      await deleteEventSponsorAction(id);
      refresh();
    });
  }

  const sortedSponsors = (sponsors ?? [])
    .slice()
    .sort((a, b) => (a.person?.name ?? "").localeCompare(b.person?.name ?? ""));

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {sponsors === undefined ? (
        <TabLoadingSkeleton />
      ) : sortedSponsors.length === 0 ? (
        <p className="app-muted text-sm">
          No sponsors or partners recorded yet.
        </p>
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
            {sortedSponsors.map((sponsor) =>
              editingId === sponsor.id ? (
                <TableRow key={sponsor.id}>
                  <TableCell colSpan={5}>
                    <SponsorForm
                      initial={formStateFor(sponsor)}
                      submitLabel="Save sponsor"
                      onSubmit={(formData) =>
                        updateEventSponsorAction(sponsor.id, formData)
                      }
                      onCancel={() => {
                        setEditingId(null);
                        refresh();
                      }}
                      people={people}
                      onPersonCreated={handlePersonCreated}
                      personDisplay={sponsor.person}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={sponsor.id}>
                  <TableCell
                    className="max-w-xs truncate font-medium"
                    title={sponsor.person?.name ?? undefined}
                  >
                    {sponsor.person?.name ?? "—"}
                  </TableCell>
                  <TableCell className="app-muted capitalize">
                    {sponsor.support_type.replace("_", " ")}
                  </TableCell>
                  <TableCell>
                    {formatValue(sponsor.contribution_value)}
                  </TableCell>
                  <TableCell className="app-muted">
                    {sponsor.is_public ? "Yes" : "No"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {mode === "edit" && (
                      <>
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
                          {isDeleting ? <Spinner /> : <Trash2 />}
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
