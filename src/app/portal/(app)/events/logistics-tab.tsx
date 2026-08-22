"use client";

import { FormEvent, Ref, useEffect, useImperativeHandle, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getEventLogisticsAction, upsertEventLogisticsAction, type EventLogistics } from "./logistics-actions";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const EMPTY: EventLogistics = {
  event_id: "",
  meeting_point: null,
  gear_requirements: null,
  transportation: null,
  food: null,
  supplies: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  notes: null,
};

function formStateFor(logistics: EventLogistics | null) {
  const source = logistics ?? EMPTY;
  return {
    meetingPoint: source.meeting_point ?? "",
    gearRequirements: source.gear_requirements ?? "",
    transportation: source.transportation ?? "",
    food: source.food ?? "",
    supplies: source.supplies ?? "",
    emergencyContactName: source.emergency_contact_name ?? "",
    emergencyContactPhone: source.emergency_contact_phone ?? "",
    notes: source.notes ?? "",
  };
}

type FormState = ReturnType<typeof formStateFor>;

export type LogisticsTabHandle = {
  discard: () => void;
};

export function LogisticsTab({
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
  ref?: Ref<LogisticsTabHandle>;
}) {
  const router = useRouter();
  const [logistics, setLogistics] = useState<EventLogistics | null | undefined>(undefined);
  const [form, setForm] = useState<FormState>(() => formStateFor(null));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  useEffect(() => {
    if (!active) return;
    getEventLogisticsAction(eventId).then((result) => {
      if ("error" in result) {
        setLoadError(result.error);
      } else {
        setLoadError(null);
        setLogistics(result.data);
        setForm(formStateFor(result.data));
      }
    });
  }, [active, eventId]);

  useEffect(() => {
    onDirtyChange?.(logistics !== undefined && JSON.stringify(form) !== JSON.stringify(formStateFor(logistics)));
  }, [form, logistics, onDirtyChange]);

  useImperativeHandle(ref, () => ({
    discard: () => {
      setError(null);
      setForm(formStateFor(logistics ?? null));
    },
  }));

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("meetingPoint", form.meetingPoint);
    formData.set("gearRequirements", form.gearRequirements);
    formData.set("transportation", form.transportation);
    formData.set("food", form.food);
    formData.set("supplies", form.supplies);
    formData.set("emergencyContactName", form.emergencyContactName);
    formData.set("emergencyContactPhone", form.emergencyContactPhone);
    formData.set("notes", form.notes);

    startTransition(async () => {
      const result = await upsertEventLogisticsAction(eventId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved();
    });
  }

  if (logistics === undefined) {
    return <p className="app-muted text-sm">Loading logistics...</p>;
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }

  if (mode === "view") {
    return (
      <FieldGroup>
        <ReadOnlyField label="Meeting point" htmlFor="logistics-meetingPoint">
          {form.meetingPoint || "—"}
        </ReadOnlyField>
        <ReadOnlyField label="Gear requirements" htmlFor="logistics-gearRequirements">
          {form.gearRequirements || "—"}
        </ReadOnlyField>
        <ReadOnlyField label="Transportation" htmlFor="logistics-transportation">
          {form.transportation || "—"}
        </ReadOnlyField>
        <ReadOnlyField label="Food" htmlFor="logistics-food">
          {form.food || "—"}
        </ReadOnlyField>
        <ReadOnlyField label="Supplies" htmlFor="logistics-supplies">
          {form.supplies || "—"}
        </ReadOnlyField>
        <Field orientation="responsive">
          <ReadOnlyField label="Emergency contact" htmlFor="logistics-emergencyContactName">
            {form.emergencyContactName || "—"}
          </ReadOnlyField>
          <ReadOnlyField label="Emergency phone" htmlFor="logistics-emergencyContactPhone">
            {form.emergencyContactPhone || "—"}
          </ReadOnlyField>
        </Field>
        <ReadOnlyField label="Notes" htmlFor="logistics-notes">
          {form.notes || "—"}
        </ReadOnlyField>
      </FieldGroup>
    );
  }

  return (
    <form id={formId} onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="logistics-meetingPoint">Meeting point</FieldLabel>
          <Input
            id="logistics-meetingPoint"
            value={form.meetingPoint}
            onChange={(changeEvent) => update("meetingPoint", changeEvent.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="logistics-gearRequirements">Gear requirements</FieldLabel>
          <Textarea
            id="logistics-gearRequirements"
            value={form.gearRequirements}
            onChange={(changeEvent) => update("gearRequirements", changeEvent.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="logistics-transportation">Transportation</FieldLabel>
          <Textarea
            id="logistics-transportation"
            value={form.transportation}
            onChange={(changeEvent) => update("transportation", changeEvent.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="logistics-food">Food</FieldLabel>
          <Textarea
            id="logistics-food"
            value={form.food}
            onChange={(changeEvent) => update("food", changeEvent.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="logistics-supplies">Supplies</FieldLabel>
          <Textarea
            id="logistics-supplies"
            value={form.supplies}
            onChange={(changeEvent) => update("supplies", changeEvent.target.value)}
          />
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="logistics-emergencyContactName">Emergency contact</FieldLabel>
            <Input
              id="logistics-emergencyContactName"
              value={form.emergencyContactName}
              onChange={(changeEvent) => update("emergencyContactName", changeEvent.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="logistics-emergencyContactPhone">Emergency phone</FieldLabel>
            <Input
              id="logistics-emergencyContactPhone"
              value={form.emergencyContactPhone}
              onChange={(changeEvent) => update("emergencyContactPhone", changeEvent.target.value)}
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="logistics-notes">Notes</FieldLabel>
          <Textarea
            id="logistics-notes"
            value={form.notes}
            onChange={(changeEvent) => update("notes", changeEvent.target.value)}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </form>
  );
}
