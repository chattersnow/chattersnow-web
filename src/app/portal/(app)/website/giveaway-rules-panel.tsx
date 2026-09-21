"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateGiveawayRulesAnswerAction } from "./settings-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { runAction } from "@/components/portal/action-toast";
import type { GiveawayRulesAnswerField } from "@/lib/giveaway-rules";
import type { SettingActionResult } from "@/lib/settings/write-app-setting";

/**
 * The answers an organization gives once, which every set of giveaway official
 * rules it publishes is then built from (#1322).
 *
 * One save per question rather than one form-wide save, matching the panels
 * beside it: each answer is its own decision and its own audit row, and a
 * half-finished form is the normal state here -- these are questions that go
 * to counsel one at a time.
 *
 * Nothing saved here reaches the public site by itself. It is served only
 * once a *giveaway's* rules are published, which is its own act in the event's
 * Giveaway tab, and what is served then is a frozen copy.
 */
export function GiveawayRulesPanel({
  fields,
  answers,
}: {
  fields: readonly GiveawayRulesAnswerField[];
  answers: Record<string, string[]>;
}) {
  return (
    <Card>
      <CardContent className="divide-y divide-[var(--line)] py-0">
        {fields.map((field) => (
          <AnswerRow
            key={field.key}
            field={field}
            value={(answers[field.key] ?? []).join("\n")}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function AnswerRow({
  field,
  value,
}: {
  field: GiveawayRulesAnswerField;
  value: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(value);
  const [isPending, startTransition] = useTransition();
  const id = `giveaway-rules-${field.key}`;
  const dirty = draft.trim() !== value.trim();

  function handleSave() {
    startTransition(async () => {
      await runAction<SettingActionResult>(
        () =>
          updateGiveawayRulesAnswerAction(
            field.key,
            draft
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
          ),
        {
          success: `Saved: ${field.label}.`,
          error: "Could not save this answer. Please try again.",
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <Field className="py-5">
      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
      <FieldDescription>{field.help}</FieldDescription>
      {field.kind === "text" ? (
        <Input
          id={id}
          value={draft}
          placeholder={field.placeholder}
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : (
        <Textarea
          id={id}
          value={draft}
          rows={4}
          placeholder={field.placeholder}
          onChange={(event) => setDraft(event.target.value)}
        />
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={!dirty || isPending}
        >
          Save
        </Button>
        {isPending ? <Spinner className="size-4" /> : null}
        {!draft.trim() && (
          <span className="app-muted text-xs">
            Not answered. Rules cannot be published while this is blank.
          </span>
        )}
      </div>
    </Field>
  );
}
