"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { getAgendaAction, upsertAgendaAction, type Agenda } from "./agenda-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Textarea } from "@/components/ui/textarea";

function AgendaForm({
  agenda,
  meetingId,
  onSaved,
  onCancel,
}: {
  agenda: Agenda | null;
  meetingId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [externalLink, setExternalLink] = useState(agenda?.external_link ?? "");
  const [bodyText, setBodyText] = useState(agenda?.body_text ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("externalLink", externalLink);
    formData.set("bodyText", bodyText);

    startTransition(async () => {
      const result = await upsertAgendaAction(meetingId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-[var(--line)] p-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="agenda-link">External link</FieldLabel>
          <Input
            id="agenda-link"
            type="url"
            placeholder="https://..."
            value={externalLink}
            onChange={(event) => setExternalLink(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="agenda-body">Agenda text</FieldLabel>
          <Textarea
            id="agenda-body"
            rows={8}
            value={bodyText}
            onChange={(event) => setBodyText(event.target.value)}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save agenda"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function AgendaTab({ meetingId, active, mode }: { meetingId: string; active: boolean; mode: "view" | "edit" }) {
  const [agenda, setAgenda] = useState<Agenda | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [prevMode, setPrevMode] = useState(mode);

  if (mode !== prevMode) {
    setPrevMode(mode);
    if (mode === "view") setEditing(false);
  }

  useEffect(() => {
    if (!active) return;
    getAgendaAction(meetingId).then((result) => {
      if ("error" in result) setLoadError(result.error);
      else setAgenda(result.data);
    });
  }, [active, meetingId]);

  if (agenda === undefined) {
    return <p className="app-muted text-sm">Loading agenda...</p>;
  }

  if (editing) {
    return (
      <AgendaForm
        agenda={agenda}
        meetingId={meetingId}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {!agenda ? (
        <div className="flex flex-col gap-3">
          <p className="app-muted text-sm">No agenda added yet.</p>
          {mode === "edit" && (
            <div>
              <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                + Add agenda
              </Button>
            </div>
          )}
        </div>
      ) : (
        <FieldGroup>
          <ReadOnlyField label="External link" htmlFor="agenda-link-view">
            {agenda.external_link ? (
              <a
                href={agenda.external_link}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--purple-deep)] underline"
              >
                {agenda.external_link}
              </a>
            ) : (
              "—"
            )}
          </ReadOnlyField>
          <ReadOnlyField label="Agenda text" htmlFor="agenda-body-view">
            <span className="whitespace-pre-wrap">{agenda.body_text || "—"}</span>
          </ReadOnlyField>
        </FieldGroup>
      )}

      {agenda && mode === "edit" && (
        <div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit agenda" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
        </div>
      )}
    </div>
  );
}
