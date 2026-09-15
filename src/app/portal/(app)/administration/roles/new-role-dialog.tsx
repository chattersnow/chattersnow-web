"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRoleAction } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { formatRoleLabel } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

export function NewRoleDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setName("");
      setLabel("");
      setDescription("");
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createRoleAction(name, description, label);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success("Role created.");
      router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={<Button type="button">New role</Button>}
      title="New role"
      description="New roles start with no permissions on any resource. Grant access from the Permissions screen once it's created."
      size="sm"
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
              "Create role"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <Field>
          <FieldLabel htmlFor="role-name" required>
            Key
          </FieldLabel>
          <Input
            id="role-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. program_manager"
            required
          />
          <FieldDescription>
            The identifier this role is stored under.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="role-label">Display name</FieldLabel>
          <Input
            id="role-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={name.trim() ? formatRoleLabel(name.trim()) : ""}
          />
          <FieldDescription>
            What this role is called throughout the portal. Leave it empty to
            use the key.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="role-description">Description</FieldLabel>
          <Textarea
            id="role-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </Field>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}
