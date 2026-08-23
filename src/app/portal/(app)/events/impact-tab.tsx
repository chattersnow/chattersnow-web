"use client";

import { FormEvent, Ref, useEffect, useImperativeHandle, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getEventImpactAction, upsertEventImpactAction, type EventImpactNote } from "./impact-actions";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type FormState = {
  totalParticipants: string;
  firstTimeParticipants: string;
  firstTimeRiders: string;
  beginnerParticipants: string;
  volunteerParticipants: string;
  subsidizedTicketsCount: string;
  rentalSubsidiesCount: string;
  equipmentLoansCount: string;
  assistanceTotal: string;
  beginnerPairingsCount: string;
  surveyRespondentsCount: string;
  surveyEasierToParticipateYesCount: string;
  surveyWouldNotHaveParticipatedWithoutAssistanceYesCount: string;
  surveyFirstTimeSkiingYesCount: string;
  surveyFeltWelcomedYesCount: string;
  surveyWouldAttendAgainYesCount: string;
  notes: string;
};

function emptyForm(): FormState {
  return {
    totalParticipants: "",
    firstTimeParticipants: "",
    firstTimeRiders: "",
    beginnerParticipants: "",
    volunteerParticipants: "",
    subsidizedTicketsCount: "",
    rentalSubsidiesCount: "",
    equipmentLoansCount: "",
    assistanceTotal: "",
    beginnerPairingsCount: "",
    surveyRespondentsCount: "",
    surveyEasierToParticipateYesCount: "",
    surveyWouldNotHaveParticipatedWithoutAssistanceYesCount: "",
    surveyFirstTimeSkiingYesCount: "",
    surveyFeltWelcomedYesCount: "",
    surveyWouldAttendAgainYesCount: "",
    notes: "",
  };
}

function numToStr(value: number | string | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function formStateFor(note: EventImpactNote | null): FormState {
  if (!note) return emptyForm();
  return {
    totalParticipants: numToStr(note.total_participants),
    firstTimeParticipants: numToStr(note.first_time_participants),
    firstTimeRiders: numToStr(note.first_time_riders),
    beginnerParticipants: numToStr(note.beginner_participants),
    volunteerParticipants: numToStr(note.volunteer_participants),
    subsidizedTicketsCount: numToStr(note.subsidized_tickets_count),
    rentalSubsidiesCount: numToStr(note.rental_subsidies_count),
    equipmentLoansCount: numToStr(note.equipment_loans_count),
    assistanceTotal: numToStr(note.assistance_total),
    beginnerPairingsCount: numToStr(note.beginner_pairings_count),
    surveyRespondentsCount: numToStr(note.survey_respondents_count),
    surveyEasierToParticipateYesCount: numToStr(note.survey_easier_to_participate_yes_count),
    surveyWouldNotHaveParticipatedWithoutAssistanceYesCount: numToStr(
      note.survey_would_not_have_participated_without_assistance_yes_count
    ),
    surveyFirstTimeSkiingYesCount: numToStr(note.survey_first_time_skiing_yes_count),
    surveyFeltWelcomedYesCount: numToStr(note.survey_felt_welcomed_yes_count),
    surveyWouldAttendAgainYesCount: numToStr(note.survey_would_attend_again_yes_count),
    notes: note.notes ?? "",
  };
}

function isDirty(form: FormState, note: EventImpactNote | null) {
  const baseline = formStateFor(note);
  return (Object.keys(baseline) as (keyof FormState)[]).some((key) => form[key] !== baseline[key]);
}

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatCurrency(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? currencyFormatter.format(numeric) : "—";
}

export type ImpactTabHandle = {
  discard: () => void;
};

export function ImpactTab({
  eventId,
  formId,
  active,
  mode,
  onSaved,
  onPendingChange,
  onDirtyChange,
  ref,
}: {
  eventId: string;
  formId: string;
  active: boolean;
  mode: "view" | "edit";
  onSaved: () => void;
  onPendingChange?: (pending: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  ref?: Ref<ImpactTabHandle>;
}) {
  const router = useRouter();
  const [note, setNote] = useState<EventImpactNote | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  useEffect(() => {
    if (!active) return;
    getEventImpactAction(eventId).then((result) => {
      if ("error" in result) {
        setLoadError(result.error);
      } else {
        setLoadError(null);
        setNote(result.data);
        setForm(formStateFor(result.data));
      }
      setLoaded(true);
    });
  }, [active, eventId]);

  useEffect(() => {
    onDirtyChange?.(isDirty(form, note));
  }, [form, note, onDirtyChange]);

  useImperativeHandle(ref, () => ({
    discard: () => {
      setError(null);
      setForm(formStateFor(note));
    },
  }));

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);

    const formData = new FormData();
    (Object.keys(form) as (keyof FormState)[]).forEach((key) => formData.set(key, form[key]));

    startTransition(async () => {
      const result = await upsertEventImpactAction(eventId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const refreshed = await getEventImpactAction(eventId);
      if (!("error" in refreshed)) {
        setNote(refreshed.data);
        setForm(formStateFor(refreshed.data));
      }
      router.refresh();
      onSaved();
    });
  }

  if (!loaded) {
    return <p className="app-muted text-sm">Loading impact notes...</p>;
  }

  if (mode === "view") {
    return (
      <div className="flex flex-col gap-6">
        {loadError && (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Participation</h4>
          <FieldGroup>
            <ReadOnlyField label="Total participants" htmlFor="impact-totalParticipants">
              {form.totalParticipants || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="First-time participants" htmlFor="impact-firstTimeParticipants">
              {form.firstTimeParticipants || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="First-time skiers/snowboarders" htmlFor="impact-firstTimeRiders">
              {form.firstTimeRiders || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Beginner participants" htmlFor="impact-beginnerParticipants">
              {form.beginnerParticipants || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Volunteer participants" htmlFor="impact-volunteerParticipants">
              {form.volunteerParticipants || "—"}
            </ReadOnlyField>
          </FieldGroup>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Financial assistance</h4>
          <FieldGroup>
            <ReadOnlyField label="Subsidized tickets" htmlFor="impact-subsidizedTicketsCount">
              {form.subsidizedTicketsCount || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Rental subsidies" htmlFor="impact-rentalSubsidiesCount">
              {form.rentalSubsidiesCount || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Equipment loans" htmlFor="impact-equipmentLoansCount">
              {form.equipmentLoansCount || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Total participant assistance" htmlFor="impact-assistanceTotal">
              {formatCurrency(note?.assistance_total)}
            </ReadOnlyField>
          </FieldGroup>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Volunteer support</h4>
          <FieldGroup>
            <ReadOnlyField label="Beginners paired with experienced riders" htmlFor="impact-beginnerPairingsCount">
              {form.beginnerPairingsCount || "—"}
            </ReadOnlyField>
          </FieldGroup>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Post-event outcomes survey</h4>
          <FieldGroup>
            <ReadOnlyField label="Survey respondents" htmlFor="impact-surveyRespondentsCount">
              {form.surveyRespondentsCount || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Made it easier to participate — yes" htmlFor="impact-surveyEasierToParticipateYesCount">
              {form.surveyEasierToParticipateYesCount || "—"}
            </ReadOnlyField>
            <ReadOnlyField
              label="Would not have participated without assistance — yes"
              htmlFor="impact-surveyWouldNotHaveParticipatedWithoutAssistanceYesCount"
            >
              {form.surveyWouldNotHaveParticipatedWithoutAssistanceYesCount || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="First time skiing/snowboarding — yes" htmlFor="impact-surveyFirstTimeSkiingYesCount">
              {form.surveyFirstTimeSkiingYesCount || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Felt welcomed and included — yes" htmlFor="impact-surveyFeltWelcomedYesCount">
              {form.surveyFeltWelcomedYesCount || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Would attend another event — yes" htmlFor="impact-surveyWouldAttendAgainYesCount">
              {form.surveyWouldAttendAgainYesCount || "—"}
            </ReadOnlyField>
          </FieldGroup>
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

        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Participation</h4>
          <FieldGroup>
            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="impact-totalParticipants">Total participants</FieldLabel>
                <Input
                  id="impact-totalParticipants"
                  type="number"
                  min={0}
                  step={1}
                  value={form.totalParticipants}
                  onChange={(event) => update("totalParticipants", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="impact-firstTimeParticipants">First-time participants</FieldLabel>
                <Input
                  id="impact-firstTimeParticipants"
                  type="number"
                  min={0}
                  step={1}
                  value={form.firstTimeParticipants}
                  onChange={(event) => update("firstTimeParticipants", event.target.value)}
                />
              </Field>
            </Field>
            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="impact-firstTimeRiders">First-time skiers/snowboarders</FieldLabel>
                <Input
                  id="impact-firstTimeRiders"
                  type="number"
                  min={0}
                  step={1}
                  value={form.firstTimeRiders}
                  onChange={(event) => update("firstTimeRiders", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="impact-beginnerParticipants">Beginner participants</FieldLabel>
                <Input
                  id="impact-beginnerParticipants"
                  type="number"
                  min={0}
                  step={1}
                  value={form.beginnerParticipants}
                  onChange={(event) => update("beginnerParticipants", event.target.value)}
                />
              </Field>
            </Field>
            <Field>
              <FieldLabel htmlFor="impact-volunteerParticipants">Volunteer participants</FieldLabel>
              <Input
                id="impact-volunteerParticipants"
                type="number"
                min={0}
                step={1}
                value={form.volunteerParticipants}
                onChange={(event) => update("volunteerParticipants", event.target.value)}
              />
            </Field>
          </FieldGroup>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Financial assistance</h4>
          <FieldGroup>
            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="impact-subsidizedTicketsCount">Subsidized tickets</FieldLabel>
                <Input
                  id="impact-subsidizedTicketsCount"
                  type="number"
                  min={0}
                  step={1}
                  value={form.subsidizedTicketsCount}
                  onChange={(event) => update("subsidizedTicketsCount", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="impact-rentalSubsidiesCount">Rental subsidies</FieldLabel>
                <Input
                  id="impact-rentalSubsidiesCount"
                  type="number"
                  min={0}
                  step={1}
                  value={form.rentalSubsidiesCount}
                  onChange={(event) => update("rentalSubsidiesCount", event.target.value)}
                />
              </Field>
            </Field>
            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="impact-equipmentLoansCount">Equipment loans</FieldLabel>
                <Input
                  id="impact-equipmentLoansCount"
                  type="number"
                  min={0}
                  step={1}
                  value={form.equipmentLoansCount}
                  onChange={(event) => update("equipmentLoansCount", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="impact-assistanceTotal">Total participant assistance ($)</FieldLabel>
                <Input
                  id="impact-assistanceTotal"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.assistanceTotal}
                  onChange={(event) => update("assistanceTotal", event.target.value)}
                />
              </Field>
            </Field>
          </FieldGroup>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Volunteer support</h4>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="impact-beginnerPairingsCount">Beginners paired with experienced riders</FieldLabel>
              <Input
                id="impact-beginnerPairingsCount"
                type="number"
                min={0}
                step={1}
                value={form.beginnerPairingsCount}
                onChange={(event) => update("beginnerPairingsCount", event.target.value)}
              />
            </Field>
          </FieldGroup>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Post-event outcomes survey</h4>
          <p className="app-muted text-xs">Enter the number of respondents and how many answered “yes” to each question.</p>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="impact-surveyRespondentsCount">Survey respondents</FieldLabel>
              <Input
                id="impact-surveyRespondentsCount"
                type="number"
                min={0}
                step={1}
                value={form.surveyRespondentsCount}
                onChange={(event) => update("surveyRespondentsCount", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="impact-surveyEasierToParticipateYesCount">
                Did Chatter make it easier for you to participate? (yes)
              </FieldLabel>
              <Input
                id="impact-surveyEasierToParticipateYesCount"
                type="number"
                min={0}
                step={1}
                value={form.surveyEasierToParticipateYesCount}
                onChange={(event) => update("surveyEasierToParticipateYesCount", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="impact-surveyWouldNotHaveParticipatedWithoutAssistanceYesCount">
                Would you have participated without the financial assistance? (yes = would NOT have)
              </FieldLabel>
              <Input
                id="impact-surveyWouldNotHaveParticipatedWithoutAssistanceYesCount"
                type="number"
                min={0}
                step={1}
                value={form.surveyWouldNotHaveParticipatedWithoutAssistanceYesCount}
                onChange={(event) =>
                  update("surveyWouldNotHaveParticipatedWithoutAssistanceYesCount", event.target.value)
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="impact-surveyFirstTimeSkiingYesCount">
                Was this your first time skiing/snowboarding? (yes)
              </FieldLabel>
              <Input
                id="impact-surveyFirstTimeSkiingYesCount"
                type="number"
                min={0}
                step={1}
                value={form.surveyFirstTimeSkiingYesCount}
                onChange={(event) => update("surveyFirstTimeSkiingYesCount", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="impact-surveyFeltWelcomedYesCount">
                Did you feel welcomed and included? (yes)
              </FieldLabel>
              <Input
                id="impact-surveyFeltWelcomedYesCount"
                type="number"
                min={0}
                step={1}
                value={form.surveyFeltWelcomedYesCount}
                onChange={(event) => update("surveyFeltWelcomedYesCount", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="impact-surveyWouldAttendAgainYesCount">
                Would you attend another Chatter event? (yes)
              </FieldLabel>
              <Input
                id="impact-surveyWouldAttendAgainYesCount"
                type="number"
                min={0}
                step={1}
                value={form.surveyWouldAttendAgainYesCount}
                onChange={(event) => update("surveyWouldAttendAgainYesCount", event.target.value)}
              />
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
