"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  getMinutesAction,
  upsertMinutesAction,
  type Minutes,
} from "./minutes-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Textarea } from "@/components/ui/textarea";
import { useResetOnModeChange, useTabData } from "@/hooks/use-tab-data";

function MinutesForm({
  minutes,
  meetingId,
  onSaved,
  onCancel,
}: {
  minutes: Minutes | null;
  meetingId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [externalLink, setExternalLink] = useState(
    minutes?.external_link ?? "",
  );
  const [bodyText, setBodyText] = useState(minutes?.body_text ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("externalLink", externalLink);
    formData.set("bodyText", bodyText);

    startTransition(async () => {
      const result = await upsertMinutesAction(meetingId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="minutes-link">External link</FieldLabel>
          <Input
            id="minutes-link"
            type="url"
            placeholder="https://..."
            value={externalLink}
            onChange={(event) => setExternalLink(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="minutes-body">Minutes text</FieldLabel>
          <Textarea
            id="minutes-body"
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
            {isPending ? "Saving..." : "Save minutes"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function MinutesTab({
  meetingId,
  active,
  mode,
}: {
  meetingId: string;
  active: boolean;
  mode: "view" | "edit";
}) {
  const { data: minutes, loadError } = useTabData<Minutes | null>(
    () => getMinutesAction(meetingId),
    active,
    [meetingId],
  );
  const [editing, setEditing] = useState(false);

  useResetOnModeChange(mode, () => setEditing(false));

  if (minutes === undefined) {
    return <p className="app-muted text-sm">Loading minutes...</p>;
  }

  if (editing) {
    return (
      <MinutesForm
        minutes={minutes}
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

      {!minutes ? (
        <div className="flex flex-col gap-3">
          <p className="app-muted text-sm">No minutes recorded yet.</p>
          {mode === "edit" && (
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(true)}
              >
                + Add minutes
              </Button>
            </div>
          )}
        </div>
      ) : (
        <FieldGroup>
          <ReadOnlyField label="External link" htmlFor="minutes-link-view">
            {minutes.external_link ? (
              <a
                href={minutes.external_link}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--purple-deep)] underline"
              >
                {minutes.external_link}
              </a>
            ) : (
              "—"
            )}
          </ReadOnlyField>
          <ReadOnlyField label="Minutes text" htmlFor="minutes-body-view">
            <span className="whitespace-pre-wrap">
              {minutes.body_text || "—"}
            </span>
          </ReadOnlyField>
        </FieldGroup>
      )}

      {minutes && mode === "edit" && (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Edit minutes"
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
        </div>
      )}
    </div>
  );
}
