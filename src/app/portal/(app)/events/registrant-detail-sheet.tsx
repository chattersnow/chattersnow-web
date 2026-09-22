"use client";

import { ArrowLeft } from "lucide-react";
import type { EventRegistrant } from "./registrants-actions";
import { RegistrantMessageActions } from "./registrant-message-actions";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RecordMessages } from "@/components/portal/record-messages";
import { useDeepLinkedSheet } from "@/components/portal/use-deep-linked-sheet";
import {
  messagingDisabledReason,
  type MessageActor,
  type RecordMessageRow,
} from "@/lib/outbound-messages";
import { REGISTRANT_MESSAGE_ERRORS } from "./registrant-messaging";
import { attendedBeforeLabel } from "@/lib/attended-before";
import {
  experienceLevelLabel,
  ridingDisciplineLabel,
} from "@/lib/rider-profile";
import { formatDateTime } from "@/lib/format";

/**
 * What a deep link names, so a future notification can open the portal at one
 * registration the way #742's links open it at one application.
 */
export const REGISTRANT_PARAM = "registrant";

/**
 * One registration, in full, and the correspondence about it (#1317).
 *
 * There was no registrant detail surface before this: the tab is a table whose
 * only per-row affordances are check-in and the rider profile dialog. A
 * composer on its own would have reintroduced the problem it exists to fix --
 * a message sent with nowhere to see what was already sent is a message that
 * lives in somebody's sent items again -- so the history comes with it.
 *
 * Two audiences, deliberately. Door staff hold `events: view`, open this to
 * read a party size or a note, and see no messaging controls at all; the
 * organizer holds `events: manage` and sees the whole thing. The rider block
 * follows the same gate it already had -- `rider` comes back null from
 * listEventRegistrantsAction() for a viewer who is not cleared for it -- so
 * this sheet cannot become a second place that data leaks from.
 */
export function RegistrantDetailSheet({
  registrant,
  eventName,
  messages,
  messageActors,
  orgName,
  replyTo,
  orgEmailEnabled,
  canManage,
  waiverInForce,
  onClosed,
  onSent,
}: {
  registrant: EventRegistrant;
  eventName: string;
  /** What has been sent about this registration, newest first. */
  messages: RecordMessageRow[];
  messageActors: MessageActor[];
  /** For the composer's default subject; blank if the tenant is unresolved. */
  orgName: string;
  /** The tenant's Reply-To, so the composer can say where a reply lands. */
  replyTo: string | null;
  orgEmailEnabled: boolean;
  canManage: boolean;
  /**
   * Whether this organization takes a participant waiver today (#686), which
   * is what separates "we never asked" from "this registration predates the
   * agreement". Nothing here ever means "they declined": declining is not
   * submitting, so a refusal leaves no registration to open.
   */
  waiverInForce: boolean;
  /** The sheet is mounted per target, so closing it unmounts it. */
  onClosed: () => void;
  onSent?: () => void;
}) {
  // Always mounted open: the tab renders this only once it has a registrant to
  // show, so the hook's job here is the other half of its contract -- taking
  // `?registrant=` back out of the URL once the sheet has been dismissed, so a
  // refresh does not re-open it.
  const { open, onOpenChange } = useDeepLinkedSheet(REGISTRANT_PARAM, true);

  const rider = registrant.rider;
  const disciplineLabel = ridingDisciplineLabel(
    rider?.riding_discipline_at_event ?? rider?.riding_discipline ?? null,
  );
  const levels = [
    [
      "Ski",
      rider?.ski_experience_level_at_event ?? rider?.ski_experience_level,
    ],
    [
      "Snowboard",
      rider?.snowboard_experience_level_at_event ??
        rider?.snowboard_experience_level,
    ],
  ]
    .map(([sport, level]) => {
      const label = experienceLevelLabel(level ?? null);
      return label ? `${sport}: ${label}` : null;
    })
    .filter((line): line is string => line !== null);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) onClosed();
      }}
    >
      <SheetContent side="right" showCloseButton={false}>
        <SheetHeader className="flex-row items-start gap-2 space-y-0">
          <Tooltip>
            <SheetClose
              render={
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Close"
                    />
                  }
                />
              }
            >
              <ArrowLeft />
            </SheetClose>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
          <div className="flex flex-1 flex-col gap-0.5">
            <SheetTitle>{registrant.name}</SheetTitle>
            <SheetDescription>
              Registered {formatDateTime(registrant.created_at)}
            </SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <FieldGroup>
            <ReadOnlyField label="Pronouns" htmlFor="registrant-pronouns">
              {registrant.pronouns || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Email" htmlFor="registrant-email">
              {registrant.email || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Phone" htmlFor="registrant-phone">
              {registrant.phone || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Party size" htmlFor="registrant-party-size">
              {registrant.party_size}
            </ReadOnlyField>
            <ReadOnlyField label="Been before" htmlFor="registrant-been-before">
              {attendedBeforeLabel(registrant.attended_before) ?? "Not asked"}
            </ReadOnlyField>
            <ReadOnlyField label="Checked in" htmlFor="registrant-checked-in">
              {registrant.checked_in_at
                ? formatDateTime(registrant.checked_in_at)
                : "Not yet"}
            </ReadOnlyField>
            {/* Hidden entirely on a tenant that has never taken a waiver and
                has none now: a row saying "not recorded" on every registrant
                of every event would be noise about a document that does not
                exist. It appears the moment one is adopted, and stays for any
                registration that carries an acceptance even if the agreement
                is later withdrawn. */}
            {(waiverInForce || registrant.waiver_accepted_at) && (
              <ReadOnlyField label="Agreement" htmlFor="registrant-waiver">
                {registrant.waiver_accepted_at ? (
                  <>
                    Accepted version {registrant.waiver_version} on{" "}
                    {formatDateTime(registrant.waiver_accepted_at)}.{" "}
                    {/* The permalink is the whole reason the column stores a
                        version rather than a copy of the text: somebody
                        reading this during a dispute reaches the exact words
                        without asking anybody. */}
                    <a
                      href={`/waiver?version=${registrant.waiver_version}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4"
                    >
                      Read that version
                    </a>
                  </>
                ) : (
                  // Not an em dash. "We had no agreement in force when they
                  // registered" and "they declined" are different facts, and
                  // only the first one can produce a row to read this on.
                  "Not recorded — no agreement was in force when they registered"
                )}
              </ReadOnlyField>
            )}
            <ReadOnlyField label="Notes" htmlFor="registrant-notes">
              {registrant.notes || "—"}
            </ReadOnlyField>

            {/* Null for a viewer who is not cleared for rider data, which is
                decided in listEventRegistrantsAction() rather than here. */}
            {rider && (disciplineLabel || levels.length > 0) ? (
              <ReadOnlyField label="Rides" htmlFor="registrant-rider">
                <span className="block">{disciplineLabel ?? "—"}</span>
                {levels.map((line) => (
                  <span key={line} className="app-muted block text-xs">
                    {line}
                  </span>
                ))}
                {rider.preferred_mountain ? (
                  <span className="app-muted block text-xs">
                    {`Prefers ${rider.preferred_mountain}`}
                  </span>
                ) : null}
              </ReadOnlyField>
            ) : null}
          </FieldGroup>

          {canManage ? (
            <section className="mt-6 flex flex-col gap-3">
              <h3 className="app-muted text-sm font-semibold">Messages</h3>
              <RegistrantMessageActions
                registrationId={registrant.id}
                registrantName={registrant.name}
                toEmail={registrant.email}
                eventName={eventName}
                orgName={orgName}
                replyTo={replyTo}
                onSent={onSent}
                disabledReason={messagingDisabledReason(
                  orgEmailEnabled,
                  registrant.email,
                  REGISTRANT_MESSAGE_ERRORS.NO_EMAIL,
                )}
              />
              <RecordMessages
                messages={messages}
                actors={messageActors}
                emptyMessage="Nothing has been sent to this registrant from the portal. The confirmation they received when they registered is not listed here — it was sent by the application itself."
              />
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
