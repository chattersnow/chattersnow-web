"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  createActionItemAction,
  deleteActionItemAction,
  listActionItemsAction,
  updateActionItemAction,
  updateActionItemStatusAction,
  type ActionItem,
} from "./action-items-actions";
import {
  ActionItemFormFields,
  emptyActionItemForm,
  packActionItemFormData,
  type ActionItemFormState,
} from "./action-item-form-fields";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

function ownerFrom(actionItem: ActionItem): PickedPerson {
  return actionItem.owner;
}

function AddActionItemForm({
  people,
  onPersonCreated,
  onSubmit,
  onCancel,
}: {
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  onSubmit: (
    ownerPersonId: string,
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [selectedOwner, setSelectedOwner] = useState<PickedPerson | null>(null);
  const [form, setForm] = useState<ActionItemFormState>(() =>
    emptyActionItemForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ActionItemFormState>(
    key: K,
    value: ActionItemFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedOwner) {
      setError("Select or create an owner for this action item.");
      return;
    }

    const owner = selectedOwner;
    startTransition(async () => {
      await runAction(() => onSubmit(owner.id, packActionItemFormData(form)), {
        success: "Action item added.",
        onError: setError,
        onSuccess: () => {
          router.refresh();
          onCancel();
        },
      });
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        <Field>
          <FieldLabel>Owner</FieldLabel>
          <PersonPicker
            people={people}
            selected={selectedOwner}
            onSelect={setSelectedOwner}
            onPersonCreated={onPersonCreated}
          />
        </Field>

        <ActionItemFormFields
          form={form}
          update={update}
          idPrefix="new-action-item"
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
              "Add action item"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function EditActionItemDialog({
  actionItem,
  people,
  onPersonCreated,
  onSaved,
  onOpenChange,
}: {
  actionItem: ActionItem;
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  onSaved: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedOwner, setSelectedOwner] = useState<PickedPerson | null>(() =>
    ownerFrom(actionItem),
  );
  const [form, setForm] = useState<ActionItemFormState>(() => ({
    description: actionItem.description,
    dueDate: actionItem.due_date ?? "",
    done: actionItem.status === "done",
  }));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ActionItemFormState>(
    key: K,
    value: ActionItemFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedOwner) {
      setError("Select or create an owner for this action item.");
      return;
    }

    const owner = selectedOwner;
    startTransition(async () => {
      await runAction(
        () =>
          updateActionItemAction(
            actionItem.id,
            owner.id,
            packActionItemFormData(form),
          ),
        {
          success: "Action item saved.",
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
          <DialogTitle>Edit action item</DialogTitle>
          <DialogDescription>
            Update this action item&apos;s details.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel>Owner</FieldLabel>
              <PersonPicker
                people={people}
                selected={selectedOwner}
                onSelect={setSelectedOwner}
                onPersonCreated={onPersonCreated}
              />
            </Field>

            <ActionItemFormFields
              form={form}
              update={update}
              idPrefix={`edit-action-item-${actionItem.id}`}
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

export function ActionItemsTab({
  meetingId,
  mode,
}: {
  meetingId: string;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const {
    data: actionItems,
    loadError,
    refresh: refreshActionItems,
  } = useTabData<ActionItem[]>(
    () => listActionItemsAction(meetingId),
    [meetingId],
  );
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isMutating, startMutation] = useTransition();

  useResetOnModeChange(mode, () => {
    setShowAdd(false);
    setEditingId(null);
  });

  useEffect(() => {
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
  }, [meetingId]);

  function refresh() {
    refreshActionItems();
    router.refresh();
  }

  function handlePersonCreated(person: PickedPerson) {
    setPeople((prev) => [...prev, person]);
  }

  function handleToggleStatus(actionItem: ActionItem) {
    const nextStatus = actionItem.status === "done" ? "open" : "done";
    startMutation(async () => {
      await runAction(
        () => updateActionItemStatusAction(actionItem.id, nextStatus),
        {
          success:
            nextStatus === "done"
              ? "Action item marked done."
              : "Action item reopened.",
          error: "Could not update the action item. Please try again.",
          onSuccess: refresh,
        },
      );
    });
  }

  function handleDelete(id: string) {
    startMutation(async () => {
      await runAction(() => deleteActionItemAction(id), {
        success: "Action item deleted.",
        error: "Could not delete the action item. Please try again.",
        onSuccess: refresh,
      });
    });
  }

  const editingItem =
    actionItems?.find((item) => item.id === editingId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {actionItems === undefined ? (
        <TabLoadingSkeleton />
      ) : actionItems.length === 0 && !showAdd ? (
        <EmptyState
          title="No action items recorded yet"
          description={
            mode === "edit"
              ? "Add the first one with Add action item below."
              : "Action items appear here once a governance manager records them for this meeting."
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Due date</TableHead>
              <TableHead>Done</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {actionItems?.map((actionItem) => (
              <TableRow key={actionItem.id}>
                <TableCell className="whitespace-normal font-medium">
                  {actionItem.description}
                </TableCell>
                <TableCell className="app-muted">
                  {personDisplayName(actionItem.owner)}
                </TableCell>
                <TableCell className="app-muted">
                  {formatCalendarDate(actionItem.due_date)}
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={actionItem.status === "done"}
                    disabled={mode !== "edit" || isMutating}
                    onCheckedChange={() => handleToggleStatus(actionItem)}
                  />
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {mode === "edit" && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit action item"
                        onClick={() => setEditingId(actionItem.id)}
                      >
                        <Pencil />
                      </Button>
                      <ConfirmDeleteButton
                        label="Remove action item"
                        title="Remove this action item?"
                        description="This deletes the item, its owner and its due date from the meeting record. It can't be undone."
                        confirmLabel="Remove"
                        pending={isMutating}
                        onConfirm={() => handleDelete(actionItem.id)}
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
          <AddActionItemForm
            people={people}
            onPersonCreated={handlePersonCreated}
            onSubmit={async (ownerPersonId, formData) => {
              const result = await createActionItemAction(
                meetingId,
                ownerPersonId,
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
              + Add action item
            </Button>
          </div>
        ))}

      {editingItem && (
        <EditActionItemDialog
          actionItem={editingItem}
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
