"use client";

import { FormEvent, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArtworkUploadField,
  type ArtworkItem,
} from "@/components/public/artwork-upload-field";
import { submitArtworkAction } from "./artwork-actions";

export function ArtworkSubmissionForm({
  code,
  maxImages,
}: {
  code: string;
  maxImages: number;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [medium, setMedium] = useState("");
  const [statement, setStatement] = useState("");
  const [company, setCompany] = useState("");
  const [items, setItems] = useState<ArtworkItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (items.length === 0) {
      setError("Add at least one image of your work.");
      return;
    }

    const formData = new FormData();
    formData.set("name", name);
    formData.set("email", email);
    formData.set("title", title);
    formData.set("medium", medium);
    formData.set("statement", statement);
    formData.set("company", company);
    // Paths and tokens only: the files themselves went straight to Storage, so
    // nothing here is anywhere near a Server Action's body limit.
    formData.set("images", JSON.stringify(items.map((item) => item.image)));

    startTransition(async () => {
      const result = await submitArtworkAction(code, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    });
  }

  if (success) {
    return (
      <Alert>
        <div className="rainbow-accent mb-2 w-10" />
        <AlertDescription>
          Thank you — we have your work. The team reviews every submission, and
          you&apos;ll hear from us at {email} about what makes the zine.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <ArtworkUploadField
          code={code}
          items={items}
          onChange={setItems}
          maxImages={maxImages}
          disabled={isPending}
        />

        <Field>
          <FieldLabel htmlFor="artwork-name">Your name</FieldLabel>
          <Input
            id="artwork-name"
            required
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="artwork-email">Email</FieldLabel>
          <Input
            id="artwork-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="artwork-title">Title of the piece</FieldLabel>
          <Input
            id="artwork-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="artwork-medium">Medium</FieldLabel>
          <Input
            id="artwork-medium"
            placeholder="Ink on paper, digital, photography…"
            value={medium}
            onChange={(event) => setMedium(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="artwork-statement">
            Tell us about your work
          </FieldLabel>
          <Textarea
            id="artwork-statement"
            rows={5}
            maxLength={2000}
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
          />
        </Field>

        {/* Honeypot: hidden from sighted/keyboard users, but bots that
            autofill every field will fill this and get silently rejected
            server-side. Not type="hidden" -- bots skip those. */}
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="artwork-company">Company</label>
          <input
            id="artwork-company"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={isPending} className="w-full sm:w-fit">
          {isPending ? "Sending..." : "Submit my artwork"}
        </Button>
      </FieldGroup>
    </form>
  );
}
