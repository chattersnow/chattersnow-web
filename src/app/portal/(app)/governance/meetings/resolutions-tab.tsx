"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  createResolutionAction,
  deleteResolutionAction,
  listResolutionsAction,
  updateResolutionAction,
  type Resolution,
} from "../resolutions/resolutions-actions";
import {
  ResolutionFormFields,
  emptyResolutionForm,
  packResolutionFormData,
  type ResolutionFormState,
} from "../resolutions/resolution-form-fields";
import { VoteOutcomeBadge } from "../resolutions/resolution-badges";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useResetOnModeChange, useTabData } from "@/hooks/use-tab-data";
import { Spinner } from "@/components/ui/spinner";
import { formatCalendarDate, personDisplayName } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";

function AddResolutionForm({
  people,
  onPersonCreated,
  onSubmit,
  onCancel,
}: {
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  onSubmit: (
    moverPersonId: string,
    seconderPersonId: string | null,
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [selectedMover, setSelectedMover] = useState<PickedPerson | null>(null);
  const [selectedSeconder, setSelectedSeconder] = useState<PickedPerson | null>(
    null,
  );
  const [form, setForm] = useState<ResolutionFormState>(() =>
    emptyResolutionForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ResolutionFormState>(
    key: K,
    value: ResolutionFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedMover) {
      setError("Select or create a mover for this resolution.");
      return;
    }

    const mover = selectedMover;
    startTransition(async () => {
      await runAction(
        () =>
          onSubmit(
            mover.id,
            selectedSeconder?.id ?? null,
            packResolutionFormData(form),
          ),
        {
          success: "Resolution added.",
          onError: setError,
          onSuccess: () => {
            router.refresh();
            onCancel();
          },
        },
      );
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        <Field>
          <FieldLabel>Mover</FieldLabel>
          <PersonPicker
            people={people}
            selected={selectedMover}
            onSelect={setSelectedMover}
            onPersonCreated={onPersonCreated}
          />
        </Field>

        <Field>
          <FieldLabel>Seconder</FieldLabel>
          <PersonPicker
            people={people}
            selected={selectedSeconder}
            onSelect={setSelectedSeconder}
            onPersonCreated={onPersonCreated}
          />
        </Field>

        <ResolutionFormFields
          form={form}
          update={update}
          idPrefix="new-resolution-tab"
        />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Add resolution"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function EditResolutionDialog({
  resolution,
  people,
  onPersonCreated,
  onSaved,
  onOpenChange,
}: {
  resolution: Resolution;
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  onSaved: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedMover, setSelectedMover] = useState<PickedPerson | null>(
    resolution.mover,
  );
  const [selectedSeconder, setSelectedSeconder] = useState<PickedPerson | null>(
    resolution.seconder,
  );
  const [form, setForm] = useState<ResolutionFormState>(() => ({
    motionText: resolution.motion_text,
    voteOutcome: resolution.vote_outcome,
    effectiveDate: resolution.effective_date ?? "",
    externalLink: resolution.external_link ?? "",
    bodyText: resolution.body_text ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ResolutionFormState>(
    key: K,
    value: ResolutionFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedMover) {
      setError("Select or create a mover for this resolution.");
      return;
    }

    const mover = selectedMover;
    startTransition(async () => {
      await runAction(
        () =>
          updateResolutionAction(
            resolution.id,
            mover.id,
            selectedSeconder?.id ?? null,
            packResolutionFormData(form),
          ),
        {
          success: "Resolution saved.",
          onError: setError,
          onSuccess: onSaved,
        },
      );
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit resolution</DialogTitle>
          <DialogDescription>
            Update this resolution&apos;s details.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel>Mover</FieldLabel>
              <PersonPicker
                people={people}
                selected={selectedMover}
                onSelect={setSelectedMover}
                onPersonCreated={onPersonCreated}
              />
            </Field>

            <Field>
              <FieldLabel>Seconder</FieldLabel>
              <PersonPicker
                people={people}
                selected={selectedSeconder}
                onSelect={setSelectedSeconder}
                onPersonCreated={onPersonCreated}
              />
            </Field>

            <ResolutionFormFields
              form={form}
              update={update}
              idPrefix={`edit-resolution-tab-${resolution.id}`}
            />

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
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ResolutionsTab({
  meetingId,
  active,
  mode,
}: {
  meetingId: string;
  active: boolean;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const {
    data: resolutions,
    loadError,
    refresh: refreshResolutions,
  } = useTabData<Resolution[]>(() => listResolutionsAction(meetingId), active, [
    meetingId,
  ]);
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isMutating, startMutation] = useTransition();

  useResetOnModeChange(mode, () => {
    setShowAdd(false);
    setEditingId(null);
  });

  useEffect(() => {
    if (!active) return;
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
  }, [active, meetingId]);

  function refresh() {
    refreshResolutions();
    router.refresh();
  }

  function handlePersonCreated(person: PickedPerson) {
    setPeople((prev) => [...prev, person]);
  }

  function handleDelete(id: string) {
    startMutation(async () => {
      await runAction(() => deleteResolutionAction(id), {
        success: "Resolution deleted.",
        error: "Could not delete the resolution. Please try again.",
        onSuccess: refresh,
      });
    });
  }

  const editingResolution =
    resolutions?.find((resolution) => resolution.id === editingId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {resolutions === undefined ? (
        <TabLoadingSkeleton />
      ) : resolutions.length === 0 && !showAdd ? (
        <EmptyState
          title="No resolutions recorded yet"
          description={
            mode === "edit"
              ? "Record the first one with Add resolution below."
              : "Resolutions appear here once a governance manager records them for this meeting."
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Motion</TableHead>
              <TableHead>Mover</TableHead>
              <TableHead>Vote outcome</TableHead>
              <TableHead>Effective date</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {resolutions?.map((resolution) => (
              <TableRow key={resolution.id}>
                <TableCell className="whitespace-normal font-medium">
                  {resolution.motion_text}
                </TableCell>
                <TableCell className="app-muted">
                  {personDisplayName(resolution.mover)}
                </TableCell>
                <TableCell>
                  <VoteOutcomeBadge outcome={resolution.vote_outcome} />
                </TableCell>
                <TableCell className="app-muted">
                  {formatCalendarDate(resolution.effective_date)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {mode === "edit" && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit resolution"
                        onClick={() => setEditingId(resolution.id)}
                      >
                        <Pencil />
                      </Button>
                      <ConfirmDeleteButton
                        label="Remove resolution"
                        title="Remove this resolution?"
                        description="This deletes the motion, its mover and its vote outcome from the meeting record. It can't be undone."
                        confirmLabel="Remove"
                        pending={isMutating}
                        onConfirm={() => handleDelete(resolution.id)}
                      />
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {mode === "edit" &&
        (showAdd ? (
          <AddResolutionForm
            people={people}
            onPersonCreated={handlePersonCreated}
            onSubmit={async (moverPersonId, seconderPersonId, formData) => {
              const result = await createResolutionAction(
                meetingId,
                moverPersonId,
                seconderPersonId,
                formData,
              );
              if (!("error" in result)) refresh();
              return result;
            }}
            onCancel={() => setShowAdd(false)}
          />
        ) : (
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAdd(true)}
            >
              + Add resolution
            </Button>
          </div>
        ))}

      {editingResolution && (
        <EditResolutionDialog
          resolution={editingResolution}
          people={people}
          onPersonCreated={handlePersonCreated}
          onSaved={() => {
            setEditingId(null);
            refresh();
          }}
          onOpenChange={(open) => {
            if (!open) setEditingId(null);
          }}
        />
      )}
    </div>
  );
}
