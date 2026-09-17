"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";
import { saveMinutesDraftAction, type MinutesRow } from "./minutes-actions";
import {
  createActionItemAction,
  type ActionItem,
} from "./action-items-actions";
import type { MinutesItem } from "./minutes-snapshot";
import { OngoingTopicsTooltip } from "./agenda-tab";
import {
  ActionItemFormFields,
  emptyActionItemForm,
  packActionItemFormData,
  type ActionItemFormState,
} from "./action-item-form-fields";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import type { PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { runAction } from "@/components/portal/action-toast";
import { SaveStatusLine } from "@/components/portal/save-status";
import { useAutosave } from "@/hooks/use-autosave";
import { useUnsavedChangesGuard } from "@/components/portal/unsaved-changes-guard";
import { formatCalendarDate, personDisplayName } from "@/lib/format";

/**
 * Taking minutes against the frozen agenda (#1200).
 *
 * The whole editor is **one** piece of state and **one** autosave, not one per
 * textarea: a save carries whatever changed since the server last accepted
 * something, so twelve sections and the closing notes coalesce into a single
 * request rather than twelve competing ones.
 *
 * Plain `<Textarea>`s. There is no rich-text editor in this repo and adding one
 * here is out of scope.
 */

export type MinutesDraft = {
  notes: Record<string, string>;
  bodyText: string;
};

/** What the tab hands the parent so a tab switch can save before it leaves. */
export type MinutesLeaveGuard = { flush: () => Promise<boolean> };

function initialDraft(minutes: MinutesRow): MinutesDraft {
  return { notes: minutes.notes, bodyText: minutes.body_text ?? "" };
}

/**
 * The note keys whose text differs from what the server last accepted.
 *
 * This is why `save_meeting_minutes_draft` merges with `||` instead of
 * replacing: sending the whole `notes` object would mean one notetaker's stale
 * copy of a section overwriting another's edit to it, every time either of them
 * paused typing. The diff is recomputed on each attempt, so a retry after a
 * failure still carries everything that has not landed.
 */
function changedNotes(
  baseline: Record<string, string>,
  next: Record<string, string>,
): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const [key, value] of Object.entries(next)) {
    if (value !== (baseline[key] ?? "")) patch[key] = value;
  }
  return patch;
}

function ItemActionItems({ items }: { items: ActionItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="app-muted mt-2 list-disc pl-5 text-sm">
      {items.map((item) => (
        <li key={item.id}>
          {item.description}
          {" — "}
          {personDisplayName(item.owner)}
          {item.due_date && ` (due ${formatCalendarDate(item.due_date)})`}
        </li>
      ))}
    </ul>
  );
}

/** What the agenda planned for this item, read from the snapshot. */
function PlannedContent({ item }: { item: MinutesItem }) {
  const planned = item.planned;
  if (!planned) return null;

  const lines = [
    planned.text ? { label: null, text: planned.text } : null,
    planned.updates ? { label: "Planned update", text: planned.updates } : null,
    planned.decisions_needed
      ? { label: "Decisions needed", text: planned.decisions_needed }
      : null,
  ].filter((line): line is { label: string | null; text: string } => !!line);

  const topics = planned.topics ?? [];
  if (lines.length === 0 && topics.length === 0) return null;

  return (
    <div className="mt-1">
      {lines.map((line) => (
        <p key={line.label ?? "text"} className="app-muted text-sm">
          {line.label && <span className="font-medium">{line.label}: </span>}
          {line.text}
        </p>
      ))}
      <OngoingTopicsTooltip topics={topics} />
    </div>
  );
}

function MinutesItemCard({
  item,
  note,
  actionItems,
  readOnly,
  onNoteChange,
  onFlush,
  onAddActionItem,
}: {
  item: MinutesItem;
  note: string;
  actionItems: ActionItem[];
  readOnly: boolean;
  onNoteChange?: (value: string) => void;
  onFlush?: () => void;
  onAddActionItem?: () => void;
}) {
  return (
    <li className="rounded-lg border border-[var(--line)] p-4">
      <p className="text-sm font-semibold">{item.label}</p>
      {/* From the snapshot, never the live agenda: the plan a notetaker is
          working against must not move under them because someone opened the
          Agenda tab in another window. */}
      <PlannedContent item={item} />

      {readOnly ? (
        note.trim() === "" ? (
          <p className="app-muted mt-2 text-sm">No notes recorded.</p>
        ) : (
          <p className="mt-2 text-sm whitespace-pre-wrap">{note}</p>
        )
      ) : (
        <Textarea
          className="mt-2"
          aria-label={`Notes for ${item.label}`}
          placeholder="What happened"
          value={note}
          onChange={(event) => onNoteChange?.(event.target.value)}
          // Leaving a field is a natural save point and costs nothing when the
          // debounce has already fired.
          onBlur={onFlush}
        />
      )}

      <ItemActionItems items={actionItems} />

      {!readOnly && onAddActionItem && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-auto p-0"
          onClick={onAddActionItem}
        >
          + Add action item
        </Button>
      )}
    </li>
  );
}

/**
 * An action item raised in the room, recorded without leaving the minutes.
 *
 * This is the single most common thing said out loud while minutes are being
 * taken, and before this it meant navigating to Overview -- the exact
 * navigation #1200 exists to remove.
 */
function AddActionItemDialog({
  meetingId,
  item,
  people,
  onPersonCreated,
  onAdded,
  onOpenChange,
}: {
  meetingId: string;
  item: MinutesItem;
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  onAdded: () => void;
  onOpenChange: (open: boolean) => void;
}) {
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
      await runAction(
        () =>
          createActionItemAction(
            meetingId,
            owner.id,
            packActionItemFormData(form, item.key),
          ),
        {
          success: "Action item added.",
          onError: setError,
          onSuccess: onAdded,
        },
      );
    });
  }

  return (
    <PortalFormSurface
      open
      onOpenChange={onOpenChange}
      withTrigger={false}
      title="Add action item"
      description={`Recorded under ${item.label}.`}
      onSubmit={handleSubmit}
      footer={
        <>
          <PortalFormSurfaceClose
            render={<Button type="button" variant="secondary" />}
          >
            Cancel
          </PortalFormSurfaceClose>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Add action item"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
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
          idPrefix={`minutes-action-item-${item.key}`}
        />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}

function itemsFor(actionItems: ActionItem[], key: string): ActionItem[] {
  return actionItems.filter((item) => item.minutes_item_key === key);
}

/** Minutes nobody may write to: finalized, or a viewer without manage access. */
export function MinutesReadOnlyView({
  minutes,
  actionItems,
  lifecycleAction,
}: {
  minutes: MinutesRow;
  actionItems: ActionItem[];
  lifecycleAction?: ReactNode;
}) {
  const items = minutes.agenda_snapshot?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge variant={minutes.status === "final" ? "success" : "progress"}>
          {minutes.status === "final" ? "Final" : "Draft"}
        </Badge>
        {lifecycleAction}
      </div>

      <ol className="flex flex-col gap-3">
        {items.map((item) => (
          <MinutesItemCard
            key={item.key}
            item={item}
            note={minutes.notes[item.key] ?? ""}
            actionItems={itemsFor(actionItems, item.key)}
            readOnly
          />
        ))}
      </ol>

      <div>
        <p className="text-sm font-semibold">Closing notes</p>
        {minutes.body_text?.trim() ? (
          <p className="mt-1 text-sm whitespace-pre-wrap">
            {minutes.body_text}
          </p>
        ) : (
          <p className="app-muted mt-1 text-sm">None.</p>
        )}
      </div>
    </div>
  );
}

export function MinutesEditor({
  meetingId,
  minutes,
  actionItems,
  people,
  onPersonCreated,
  onActionItemAdded,
  lifecycleAction,
  guardRef,
}: {
  meetingId: string;
  minutes: MinutesRow;
  actionItems: ActionItem[];
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  /** Refreshes the item list in place -- never the whole route, mid-meeting. */
  onActionItemAdded: () => void;
  lifecycleAction?: ReactNode;
  guardRef: RefObject<MinutesLeaveGuard | null>;
}) {
  const items = minutes.agenda_snapshot?.items ?? [];
  const [draft, setDraft] = useState<MinutesDraft>(() => initialDraft(minutes));
  const [addingUnder, setAddingUnder] = useState<string | null>(null);

  // What the server has accepted, and therefore what the next save diffs
  // against. Written only by a save that succeeded, so a failure leaves the
  // next attempt carrying everything that has not landed.
  const savedRef = useRef<MinutesDraft>(initialDraft(minutes));

  const autosave = useAutosave<MinutesDraft>({
    save: async (value) => {
      const baseline = savedRef.current;
      const notes = changedNotes(baseline.notes, value.notes);
      const bodyTextChanged = value.bodyText !== baseline.bodyText;
      // Nothing moved -- a flush on blur with no edit behind it. Skip the
      // round trip rather than writing an empty merge.
      if (Object.keys(notes).length === 0 && !bodyTextChanged) return {};

      const result = await saveMinutesDraftAction(meetingId, {
        notes,
        // Absent, not null: `parseMinutesPatch` reads an absent field as "leave
        // the closing notes alone" and `null` as "clear them".
        ...(bodyTextChanged ? { bodyText: value.bodyText } : {}),
      });
      if (!("error" in result)) savedRef.current = value;
      return result;
    },
  });
  const { flush, queue } = autosave;

  // The honest last line. Autosave shrinks the unsaved window to about a
  // second, but a save that keeps failing leaves the only copy of the text in
  // these textareas, so the browser still asks before a refresh throws it
  // away. The tab-switch half of the same guard is in meeting-detail-view.tsx,
  // which owns the tab strip.
  useUnsavedChangesGuard(autosave.dirty);

  // Published for the tab strip, which saves before it unmounts this panel.
  useEffect(() => {
    guardRef.current = { flush };
    return () => {
      guardRef.current = null;
    };
  }, [guardRef, flush]);

  function edit(next: MinutesDraft) {
    setDraft(next);
    queue(next);
  }

  function openActionItemDialog(key: string) {
    // Started before the dialog opens, so the sentence being typed is on its
    // way to the server rather than waiting out a debounce behind a modal.
    // Not awaited: the dialog should open now, not after a round trip.
    void flush();
    setAddingUnder(key);
  }

  const addingItem = items.find((item) => item.key === addingUnder) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="progress">Draft</Badge>
          <SaveStatusLine
            status={autosave.status}
            lastSavedAt={autosave.lastSavedAt}
          />
        </div>
        {lifecycleAction}
      </div>

      {autosave.status === "error" && autosave.errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{autosave.errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          <ol className="flex flex-col gap-3">
            {items.map((item) => (
              <MinutesItemCard
                key={item.key}
                item={item}
                note={draft.notes[item.key] ?? ""}
                actionItems={itemsFor(actionItems, item.key)}
                readOnly={false}
                onNoteChange={(value) =>
                  edit({
                    ...draft,
                    notes: { ...draft.notes, [item.key]: value },
                  })
                }
                onFlush={() => void flush()}
                onAddActionItem={() => openActionItemDialog(item.key)}
              />
            ))}
          </ol>

          <Field>
            <FieldLabel htmlFor="minutes-closing-notes">
              Closing notes
            </FieldLabel>
            <Textarea
              id="minutes-closing-notes"
              placeholder="Anything that belongs to the meeting as a whole"
              value={draft.bodyText}
              onChange={(event) =>
                edit({ ...draft, bodyText: event.target.value })
              }
              onBlur={() => void flush()}
            />
          </Field>
        </div>
        {/* The quick-reference column lands in the follow-up issue. */}
      </div>

      {addingItem && (
        <AddActionItemDialog
          meetingId={meetingId}
          item={addingItem}
          people={people}
          onPersonCreated={onPersonCreated}
          onAdded={() => {
            setAddingUnder(null);
            onActionItemAdded();
          }}
          onOpenChange={(open) => {
            if (!open) setAddingUnder(null);
          }}
        />
      )}
    </div>
  );
}
