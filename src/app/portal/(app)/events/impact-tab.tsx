"use client";

import {
  FormEvent,
  Ref,
  useEffect,
  useImperativeHandle,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  getEventImpactAction,
  upsertEventImpactAction,
  type EventImpactNote,
} from "./impact-actions";
import { InfoIcon } from "lucide-react";
import { useTabData } from "@/hooks/use-tab-data";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatTile } from "../home/stat-tile";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { formatCurrency } from "@/lib/format";
import type { EventImpactDerived } from "@/lib/portal/impact-metrics";

type FormState = {
  firstTimeRiders: string;
  rentalSubsidiesCount: string;
  assistanceTotal: string;
  beginnerPairingsCount: string;
  notes: string;
};

function emptyForm(): FormState {
  return {
    firstTimeRiders: "",
    rentalSubsidiesCount: "",
    assistanceTotal: "",
    beginnerPairingsCount: "",
    notes: "",
  };
}

function numToStr(value: number | string | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function formStateFor(note: EventImpactNote | null): FormState {
  if (!note) return emptyForm();
  return {
    firstTimeRiders: numToStr(note.first_time_riders),
    rentalSubsidiesCount: numToStr(note.rental_subsidies_count),
    assistanceTotal: numToStr(note.assistance_total),
    beginnerPairingsCount: numToStr(note.beginner_pairings_count),
    notes: note.notes ?? "",
  };
}

function isDirty(form: FormState, note: EventImpactNote | null) {
  const baseline = formStateFor(note);
  return (Object.keys(baseline) as (keyof FormState)[]).some(
    (key) => form[key] !== baseline[key],
  );
}

function statValue(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : value;
}

export type ImpactTabHandle = {
  discard: () => void;
};

/**
 * The figures the system already holds, shown in place of the fields staff used
 * to retype at report time. Rendered in both view and edit mode — they are never
 * editable, so there is nothing to hide behind the pencil.
 */
function DerivedFigures({ derived }: { derived: EventImpactDerived | null }) {
  if (!derived) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-semibold">Participation</h4>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile label="Participants" value={derived.participants} />
          <StatTile label="Checked in" value={derived.checkedIn} />
          <StatTile
            label="First-time participants"
            value={derived.firstTimeParticipants}
          />
          <StatTile
            label="Recurring participants"
            value={derived.recurringParticipants}
          />
          <StatTile
            label="Volunteers on site"
            value={derived.volunteerParticipants}
          />
          {derived.beginnerParticipants !== null && (
            <StatTile
              label="Beginner participants"
              value={derived.beginnerParticipants}
            />
          )}
        </div>
        <p className="app-muted text-xs">
          Participants is the headcount from the Attendance card; checked in
          counts registrants marked in at the door.
          {/* The caveat is only true while coverage is short: once every
              checked-in attendee has a profile, the beginner count is the
              whole picture and hedging it just makes staff distrust it. */}
          {derived.beginnerParticipants !== null &&
            (derived.profiledAttendees ?? 0) < derived.checkedIn &&
            ` Beginners are ${derived.beginnerParticipants} of ${derived.profiledAttendees ?? 0} attendees with a rider profile on file — add the missing ones from the Registrants tab.`}
        </p>
      </div>

      {derived.discountCodesAssigned !== null && (
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Discount codes</h4>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile
              label="Codes assigned to a registrant"
              value={derived.discountCodesAssigned}
            />
          </div>
          {derived.autoAssignDiscountCodes && (
            <p className="app-muted text-xs">
              This event auto-assigns a code to every registrant, so this count
              is not evidence of subsidy.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ImpactTab({
  eventId,
  formId,
  derived,
  mode,
  onSaved,
  onPendingChange,
  onDirtyChange,
  ref,
}: {
  eventId: string;
  formId: string;
  derived: EventImpactDerived | undefined;
  mode: "view" | "edit";
  onSaved: () => void;
  onPendingChange?: (pending: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  ref?: Ref<ImpactTabHandle>;
}) {
  const router = useRouter();
  const {
    data: note,
    loadError,
    refresh,
  } = useTabData<EventImpactNote | null>(
    () => getEventImpactAction(eventId),
    [eventId],
  );
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [prevNote, setPrevNote] = useState(note);

  if (note !== prevNote) {
    setPrevNote(note);
    if (note !== undefined) setForm(formStateFor(note));
  }

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  useEffect(() => {
    onDirtyChange?.(isDirty(form, note ?? null));
  }, [form, note, onDirtyChange]);

  useImperativeHandle(ref, () => ({
    discard: () => {
      setError(null);
      setForm(formStateFor(note ?? null));
    },
  }));

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);

    const formData = new FormData();
    (Object.keys(form) as (keyof FormState)[]).forEach((key) =>
      formData.set(key, form[key]),
    );

    startTransition(async () => {
      const result = await upsertEventImpactAction(eventId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      refresh();
      router.refresh();
      onSaved();
    });
  }

  if (note === undefined) {
    return <TabLoadingSkeleton />;
  }

  if (mode === "view") {
    return (
      <div className="flex flex-col gap-6">
        {loadError && (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}
        <Alert>
          <InfoIcon />
          <AlertTitle>How these numbers are calculated</AlertTitle>
          <AlertDescription>
            Participation and discount-code figures are computed live from
            attendance, check-ins, volunteer records and rider profiles — there
            is nothing to type. Only the figures below them have no system
            source and are still entered by staff. Events that predate check-in
            tracking will show low computed figures; their original hand-entered
            numbers were archived, not discarded.
          </AlertDescription>
        </Alert>

        <DerivedFigures derived={derived ?? null} />

        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Staff-entered figures</h4>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="First-time skiers/snowboarders"
              value={statValue(note?.first_time_riders)}
            />
            <StatTile
              label="Rental subsidies"
              value={statValue(note?.rental_subsidies_count)}
            />
            <StatTile
              label="Total participant assistance"
              value={formatCurrency(note?.assistance_total)}
            />
            <StatTile
              label="Beginners paired with experienced riders"
              value={statValue(note?.beginner_pairings_count)}
            />
          </div>
        </div>

        <ReadOnlyField label="Notes" htmlFor="impact-notes">
          {form.notes || "—"}
        </ReadOnlyField>
      </div>
    );
  }

  return (
    <form id={formId} onSubmit={handleSubmit}>
      <div className="flex flex-col gap-6">
        {loadError && (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}

        <DerivedFigures derived={derived ?? null} />

        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Staff-entered figures</h4>
          <p className="app-muted text-xs">
            Nothing in the system records these, so they can only come from you.
          </p>
          <FieldGroup>
            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="impact-firstTimeRiders">
                  First-time skiers/snowboarders
                </FieldLabel>
                <Input
                  id="impact-firstTimeRiders"
                  type="number"
                  min={0}
                  step={1}
                  value={form.firstTimeRiders}
                  onChange={(event) =>
                    update("firstTimeRiders", event.target.value)
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="impact-rentalSubsidiesCount">
                  Rental subsidies
                </FieldLabel>
                <Input
                  id="impact-rentalSubsidiesCount"
                  type="number"
                  min={0}
                  step={1}
                  value={form.rentalSubsidiesCount}
                  onChange={(event) =>
                    update("rentalSubsidiesCount", event.target.value)
                  }
                />
              </Field>
            </Field>
            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="impact-assistanceTotal">
                  Total participant assistance ($)
                </FieldLabel>
                <Input
                  id="impact-assistanceTotal"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.assistanceTotal}
                  onChange={(event) =>
                    update("assistanceTotal", event.target.value)
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="impact-beginnerPairingsCount">
                  Beginners paired with experienced riders
                </FieldLabel>
                <Input
                  id="impact-beginnerPairingsCount"
                  type="number"
                  min={0}
                  step={1}
                  value={form.beginnerPairingsCount}
                  onChange={(event) =>
                    update("beginnerPairingsCount", event.target.value)
                  }
                />
              </Field>
            </Field>
          </FieldGroup>
        </div>

        <Field>
          <FieldLabel htmlFor="impact-notes">Notes</FieldLabel>
          <Textarea
            id="impact-notes"
            placeholder="Anything else worth capturing about this event's impact."
            value={form.notes}
            onChange={(event) => update("notes", event.target.value)}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </form>
  );
}
