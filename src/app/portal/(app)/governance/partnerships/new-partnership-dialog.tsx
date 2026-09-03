"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPartnershipOpportunityAction } from "./partnerships-actions";
import {
  PartnershipOpportunityFormFields,
  emptyPartnershipOpportunityForm,
  packPartnershipOpportunityFormData,
  type PartnershipOpportunityFormState,
} from "./partnership-opportunity-form-fields";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import type { PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export function NewPartnershipDialog({ people }: { people: PersonListItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [availablePeople, setAvailablePeople] = useState(people);
  const [organization, setOrganization] = useState<PickedPerson | null>(null);
  const [owner, setOwner] = useState<PickedPerson | null>(null);
  const [form, setForm] = useState<PartnershipOpportunityFormState>(() =>
    emptyPartnershipOpportunityForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof PartnershipOpportunityFormState>(
    key: K,
    value: PartnershipOpportunityFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setAvailablePeople(people);
      setOrganization(null);
      setOwner(null);
      setForm(emptyPartnershipOpportunityForm());
      setError(null);
    }
  }

  function handlePersonCreated(person: PickedPerson) {
    setAvailablePeople((prev) => [...prev, person]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createPartnershipOpportunityAction(
        organization?.id ?? null,
        owner?.id ?? null,
        packPartnershipOpportunityFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success("Partnership added.");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" className="shrink-0 whitespace-nowrap" />}
      >
        Add opportunity
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add partnership opportunity</DialogTitle>
          <DialogDescription>
            Track a prospective partner and its next step.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel>Partner organization</FieldLabel>
              <PersonPicker
                people={availablePeople}
                selected={organization}
                onSelect={setOrganization}
                onPersonCreated={handlePersonCreated}
                newPersonRole="is_sponsor"
              />
            </Field>

            <PartnershipOpportunityFormFields
              form={form}
              update={update}
              idPrefix="new-partnership"
            />

            <Field>
              <FieldLabel>Internal owner</FieldLabel>
              <PersonPicker
                people={availablePeople}
                selected={owner}
                onSelect={setOwner}
                onPersonCreated={handlePersonCreated}
              />
            </Field>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Add opportunity"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
