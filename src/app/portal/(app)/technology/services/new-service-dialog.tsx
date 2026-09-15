"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createServiceAction } from "../actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

export function NewServiceDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setName("");
      setWebsite("");
      setNotes("");
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createServiceAction(name, website, notes);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success("Service added.");
      router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={<Button type="button">New service</Button>}
      title="Add service"
      description="Record the provider a technology asset belongs to."
      onSubmit={handleSubmit}
      footer={
        <>
          <PortalFormSurfaceClose
            render={<Button type="button" variant="secondary" />}
          >
            Cancel
          </PortalFormSurfaceClose>
          <Button type="submit" disabled={isPending || !name.trim()}>
            {isPending ? (
              <>
                <Spinner /> Creating...
              </>
            ) : (
              "Add service"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <Field>
          <FieldLabel htmlFor="new-service-page-name" required>
            Name
          </FieldLabel>
          <Input
            id="new-service-page-name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Cloudflare"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-service-page-website">Website</FieldLabel>
          <Input
            id="new-service-page-website"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder="https://"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-service-page-notes">Notes</FieldLabel>
          <Textarea
            id="new-service-page-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
          />
        </Field>
      </FieldGroup>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </PortalFormSurface>
  );
}
