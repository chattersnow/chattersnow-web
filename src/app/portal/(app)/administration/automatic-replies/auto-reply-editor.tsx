"use client";

import {
  FormEvent,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailWarning } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { runAction } from "@/components/portal/action-toast";
import {
  DiscardChangesDialog,
  useUnsavedChangesGuard,
} from "@/components/portal/unsaved-changes-guard";
import { useUrlTabState } from "@/components/portal/use-url-tab-state";
import {
  AUTO_REPLIES,
  AUTO_REPLY_TOKEN_DESCRIPTIONS,
  autoReplyDefinition,
  validateAutoReplySlots,
  type AutoReplyDefinition,
  type AutoReplySlot,
  type AutoReplySlotKey,
  type AutoReplyToken,
} from "@/lib/notifications/auto-replies";
import { cn } from "@/lib/utils";
import type { DeviceClass } from "@/proxy";
import { AutoReplyRail, type RailEntry } from "./auto-reply-rail";
import { DisableReplyDialog } from "./disable-reply-dialog";
import { AutoReplyPreviewPanel } from "./preview-panel";
import { saveAutoReplyCopyAction, setAutoReplyEnabledAction } from "./actions";

/** One tenant's row, as the page read it. */
export type SavedAutoReply = {
  enabled: boolean;
  /** Only the slots this tenant has rewritten. */
  slots: Record<string, string>;
};

/**
 * What one reply's fields hold right now.
 *
 * `null` is not "empty": it is "this tenant has never rewritten this slot", so
 * the field shows the platform's wording and the save leaves the key out of
 * `slots` entirely. That is what keeps a tenant who has written nothing (or
 * who resets) tracking the defaults as they improve, rather than freezing
 * today's copy under their own name (#1233). An empty string is a slot they
 * deliberately blanked, and is saved.
 */
type Draft = Record<AutoReplySlotKey, string | null>;

function draftFor(definition: AutoReplyDefinition, saved?: SavedAutoReply) {
  return Object.fromEntries(
    definition.slots.map((slot) => {
      const value = saved?.slots?.[slot.key];
      return [slot.key, typeof value === "string" ? value : null];
    }),
  ) as Draft;
}

/** The sparse object the action writes: the rewritten slots and nothing else. */
function overrides(draft: Draft): Record<string, string> {
  return Object.fromEntries(
    Object.entries(draft).filter(
      (entry): entry is [string, string] => entry[1] !== null,
    ),
  );
}

function sameDraft(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A field's control, for its label and its token chips to point at. */
function slotControlId(kind: string, slot: AutoReplySlotKey): string {
  return `auto-reply-${kind}-${slot}`;
}

/**
 * The automatic replies editor: one reply at a time, with a rail that reaches
 * the others (#1235).
 *
 * The tenant writes the wrapping -- subject, greeting, intro, closing,
 * sign-off -- and the platform keeps rendering the payload: the event detail
 * rows and the calendar attachment, the reference code and its status link,
 * the item list and the meetup instructions. That split is the registry's
 * (`src/lib/notifications/auto-replies.ts`) and this page does not widen it.
 *
 * Nothing about branding is here either. The logo, the header and the link
 * colour come from the tenant's `brand.*` tokens through the shared email
 * shell (#1238); a slot is a sentence, the shell is the paper it is printed
 * on, and Organization Settings → Branding owns the paper.
 */
export function AutoReplyEditor({
  device,
  saved,
  emailEnabled,
}: {
  /** Which shape the rail takes, decided on the server (#1079, #1093). */
  device: DeviceClass;
  /** This tenant's rows, by kind. A kind with no row is on the defaults. */
  saved: Record<string, SavedAutoReply>;
  /** The org-wide kill switch, which outranks every switch on this page. */
  emailEnabled: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useUrlTabState<string>({
    param: "reply",
    fallback: AUTO_REPLIES[0].kind,
    isValid: (value): value is string =>
      autoReplyDefinition(value) !== undefined,
  });
  const definition = autoReplyDefinition(active) ?? AUTO_REPLIES[0];
  const initial = draftFor(definition, saved[definition.kind]);

  // The draft carries the kind it belongs to, so a Back button that changes
  // `?reply=` without going through `select()` falls back to that reply's
  // saved copy instead of showing the previous one's edits under its labels.
  const [draft, setDraft] = useState<{ kind: string; slots: Draft }>(() => ({
    kind: definition.kind,
    slots: initial,
  }));
  const slots = draft.kind === definition.kind ? draft.slots : initial;

  const [error, setError] = useState<string | null>(null);
  const [problemSlots, setProblemSlots] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [pendingKind, setPendingKind] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // The boxes themselves, so a token chip can insert at the caret rather than
  // at the end. Written in a ref callback and read only in event handlers.
  const fields = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement>>(
    {},
  );

  const dirty = !sameDraft(slots, initial);
  const guard = useUnsavedChangesGuard(dirty);

  function setSlot(key: AutoReplySlotKey, value: string | null) {
    setDraft({ kind: definition.kind, slots: { ...slots, [key]: value } });
  }

  function switchTo(kind: string) {
    const next = autoReplyDefinition(kind);
    if (!next) return;
    setDraft({ kind, slots: draftFor(next, saved[kind]) });
    setError(null);
    setProblemSlots(new Set());
    setActive(kind);
  }

  function select(kind: string) {
    if (kind === definition.kind) return;
    // Switching unmounts these fields, and unlike Site Content there is no
    // saved draft to come back to, so an unsaved edit is always worth
    // interrupting for.
    if (guard.allowOpenChange(false)) {
      switchTo(kind);
      return;
    }
    setPendingKind(kind);
  }

  function insertToken(slot: AutoReplySlot, token: AutoReplyToken) {
    const control = fields.current[slot.key];
    const current = slots[slot.key] ?? slot.default;
    const start = control?.selectionStart ?? current.length;
    const end = control?.selectionEnd ?? current.length;
    const snippet = `{{${token}}}`;
    setSlot(slot.key, current.slice(0, start) + snippet + current.slice(end));

    // The box still holds the previous value at this point, so the caret is
    // placed after React has painted the new one -- otherwise it lands at the
    // wrong offset, or at the end, which is the thing this avoids.
    const caret = start + snippet.length;
    requestAnimationFrame(() => {
      control?.focus();
      control?.setSelectionRange(caret, caret);
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = overrides(slots);

    // Checked here and again in the action. This half explains the refusal
    // beside the field; the action's half is the control, because a Server
    // Action is reachable without this form.
    const problems = validateAutoReplySlots(definition, payload);
    if (problems.length > 0) {
      setError(problems.map((problem) => problem.message).join(" "));
      setProblemSlots(
        new Set(
          problems
            .map((problem) => problem.slot)
            .filter((slot): slot is AutoReplySlotKey => slot !== null),
        ),
      );
      return;
    }

    setError(null);
    setProblemSlots(new Set());
    startTransition(async () => {
      await runAction(() => saveAutoReplyCopyAction(definition.kind, payload), {
        success: `${definition.label} saved.`,
        onError: setError,
        onSuccess: () => router.refresh(),
      });
    });
  }

  function resetTemplate() {
    setDraft({
      kind: definition.kind,
      slots: draftFor(definition, undefined),
    });
    setError(null);
    setProblemSlots(new Set());
  }

  const entries: RailEntry[] = AUTO_REPLIES.map((candidate) => {
    const row = saved[candidate.kind];
    const written =
      candidate.kind === definition.kind
        ? overrides(slots)
        : (row?.slots ?? {});
    return {
      kind: candidate.kind,
      label: candidate.label,
      module: candidate.module,
      description: candidate.description,
      enabled: row?.enabled ?? true,
      customized: Object.keys(written).length,
      text: candidate.slots
        .map((slot) => written[slot.key] ?? slot.default)
        .join(" "),
    };
  });

  const customized = Object.keys(overrides(slots)).length;

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <AutoReplyRail
          device={device}
          entries={entries}
          active={definition.kind}
          dirtyKind={dirty ? definition.kind : null}
          onSelect={select}
        />

        {/* The pane, which holds the fields and the preview side by side --
            which is why the rail takes a column of its own rather than the
            editor splitting this one (#1235, #1236). */}
        <div className="min-w-0 space-y-6">
          {!emailEnabled && (
            <Alert>
              <MailWarning />
              <AlertDescription>
                Outbound email is switched off for this organization, so none of
                these replies is being sent at the moment — whatever the
                switches below say.{" "}
                <Link
                  href="/portal/administration/organization-settings?tab=notifications"
                  className="underline underline-offset-4"
                >
                  Change that in Notifications
                </Link>
                .
              </AlertDescription>
            </Alert>
          )}

          <div>
            <h2 className="text-lg font-semibold">{definition.label}</h2>
            <p className="app-muted mt-1 max-w-2xl text-sm leading-relaxed">
              {definition.description}
            </p>
          </div>

          <EnabledCard
            kind={definition.kind}
            label={definition.label}
            enabled={saved[definition.kind]?.enabled ?? true}
          />

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* The fields and the email they compose, side by side where there
              is room: an administrator rewriting a sentence is checking it
              against what the reader will see, and a preview a scroll away is
              one they will stop looking at. It drops under the fields on a
              narrow screen rather than shrinking to nothing. */}
          <div className="grid gap-6 2xl:grid-cols-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              <Card>
                <CardContent className="space-y-6">
                  {definition.slots.map((slot) => (
                    <SlotField
                      key={slot.key}
                      kind={definition.kind}
                      slot={slot}
                      value={slots[slot.key]}
                      invalid={problemSlots.has(slot.key)}
                      disabled={isPending}
                      register={(control) => {
                        if (control) fields.current[slot.key] = control;
                        else delete fields.current[slot.key];
                      }}
                      onChange={(value) => setSlot(slot.key, value)}
                      onReset={() => setSlot(slot.key, null)}
                      onInsertToken={(token) => insertToken(slot, token)}
                    />
                  ))}
                </CardContent>
              </Card>

              {/* Sticky for the reason Site Content's is: the five fields plus
                their token chips run past a screen, and the control that
                commits should not be the thing you scroll to find. */}
              <div className="rainbow-surface sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
                <p className="app-muted text-sm" aria-live="polite">
                  {statusLine(dirty, customized)}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPending || customized === 0}
                    onClick={resetTemplate}
                  >
                    Reset all fields
                  </Button>
                  <Button type="submit" disabled={isPending || !dirty}>
                    {isPending ? (
                      <>
                        <Spinner /> Saving...
                      </>
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </div>
            </form>

            <AutoReplyPreviewPanel
              kind={definition.kind}
              label={definition.label}
              slots={overrides(slots)}
              enabled={saved[definition.kind]?.enabled ?? true}
              emailEnabled={emailEnabled}
            />
          </div>
        </div>
      </div>

      <DiscardChangesDialog
        guard={guard}
        subject={`the ${definition.label.toLowerCase()}`}
        onDiscard={() => {
          if (pendingKind) switchTo(pendingKind);
          setPendingKind(null);
        }}
      />
    </>
  );
}

/**
 * One reply's own switch.
 *
 * Applied on the switch rather than folded into Save, like the org-wide kill
 * switch it sits under: turning a receipt off is an operational decision, not
 * a draft. `useOptimistic` drops back to the server's value when the
 * transition ends, so it can never keep showing a change the server refused.
 */
function EnabledCard({
  kind,
  label,
  enabled,
}: {
  kind: string;
  label: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useOptimistic(enabled);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const labelId = `auto-reply-enabled-${kind}`;

  function apply(next: boolean) {
    startTransition(async () => {
      setChecked(next);
      await runAction(() => setAutoReplyEnabledAction(kind, next), {
        success: next
          ? `${label} is on.`
          : `${label} is off. Nobody will be sent one.`,
        onSuccess: () => router.refresh(),
      });
    });
  }

  function handleChange(next: boolean) {
    // Turning one of these off is not cosmetic -- the confirmation says what
    // stops working -- so it is the only direction that asks.
    if (!next) {
      setConfirming(true);
      return;
    }
    apply(true);
  }

  return (
    <>
      <Card>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p id={labelId} className="text-sm font-medium">
                Send this reply
              </p>
              <p className="app-muted mt-1 text-sm leading-relaxed">
                When this is off the form still works and the notice still
                reaches your team — the person who filled it in simply hears
                nothing back.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              {isPending ? <Spinner className="size-4" /> : null}
              <span className="app-muted w-8 text-right text-xs">
                {checked ? "On" : "Off"}
              </span>
              <Switch
                checked={checked}
                onCheckedChange={handleChange}
                disabled={isPending}
                aria-labelledby={labelId}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <DisableReplyDialog
        kind={kind}
        label={label}
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() => {
          setConfirming(false);
          apply(false);
        }}
      />
    </>
  );
}

function SlotField({
  kind,
  slot,
  value,
  invalid,
  disabled,
  register,
  onChange,
  onReset,
  onInsertToken,
}: {
  kind: string;
  slot: AutoReplySlot;
  /** Null when the tenant has never rewritten this slot. */
  value: string | null;
  invalid: boolean;
  disabled: boolean;
  register: (control: HTMLInputElement | HTMLTextAreaElement | null) => void;
  onChange: (value: string) => void;
  onReset: () => void;
  onInsertToken: (token: AutoReplyToken) => void;
}) {
  const controlId = slotControlId(kind, slot.key);
  const countId = `${controlId}-count`;
  // A slot nobody has rewritten reads as prefilled, not empty: what is in the
  // box is what is being sent today, and typing into it is an edit rather
  // than a first draft.
  const text = value ?? slot.default;
  const over = text.length > slot.maxLength;

  return (
    <Field>
      <div className="flex flex-wrap items-center gap-2">
        <FieldLabel htmlFor={controlId}>{slot.label}</FieldLabel>
        {value !== null && (
          <span className="app-muted rounded-full border border-[var(--line)] px-2 py-0.5 text-xs font-normal">
            Your wording
          </span>
        )}
      </div>

      {slot.shape === "paragraph" ? (
        <Textarea
          id={controlId}
          ref={register}
          rows={3}
          value={text}
          aria-invalid={invalid || over}
          aria-describedby={countId}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={controlId}
          ref={register}
          value={text}
          aria-invalid={invalid || over}
          aria-describedby={countId}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      <FieldDescription>{slot.description}</FieldDescription>
      <FieldDescription
        id={countId}
        className={cn(over && "text-[var(--destructive)]")}
      >
        {text.length} of {slot.maxLength} characters
      </FieldDescription>

      {slot.tokens.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <FieldTitle className="app-muted text-xs font-normal">
            Insert:
          </FieldTitle>
          {slot.tokens.map((token) => (
            <Tooltip key={token}>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    // The field and the description are both in the button's
                    // own name rather than only in the tooltip. A tooltip is
                    // a hover, and what `{{reference_code}}` resolves to is
                    // the whole reason to press it; naming the field is what
                    // keeps fifteen chips on this page from being fifteen
                    // buttons called the same three things.
                    aria-label={`Insert {{${token}}} into ${slot.label} — ${AUTO_REPLY_TOKEN_DESCRIPTIONS[token]}`}
                    onClick={() => onInsertToken(token)}
                  />
                }
              >
                <code className="text-xs">{`{{${token}}}`}</code>
              </TooltipTrigger>
              <TooltipContent>
                {AUTO_REPLY_TOKEN_DESCRIPTIONS[token]}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}

      {value !== null && (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={onReset}>
            Back to the platform&rsquo;s wording
          </Button>
        </div>
      )}
    </Field>
  );
}

/** What is outstanding, and what this tenant has made its own. */
function statusLine(dirty: boolean, customized: number): string {
  if (dirty) return "Unsaved changes.";
  if (customized === 0) return "Every field is the platform's wording.";
  return `${customized} field${customized === 1 ? "" : "s"} written by you.`;
}
