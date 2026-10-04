"use client";

import { answerRequestState } from "@/lib/registration-answer-requests";
import { StatusBadge } from "@/components/portal/status-badge";
import { formatInstantDate } from "@/lib/format";
import type { EventRegistrant } from "./registrants-actions";

/**
 * "Asked {date}" or "Answered" under the name (#1502), for a registration that
 * has been sent a link. Under the name for the reason the other badges are:
 * the table is already wide, and a column would be the first thing dropped.
 */
function AnswerRequestBadge({ registrant }: { registrant: EventRegistrant }) {
  const state = answerRequestState(registrant.answer_request);
  if (!state) return null;
  return state.state === "answered" ? (
    <StatusBadge tone="success" className="mt-1 font-normal">
      Answered
    </StatusBadge>
  ) : (
    <StatusBadge tone="info" className="mt-1 font-normal">
      {`Asked ${formatInstantDate(state.at)}`}
    </StatusBadge>
  );
}

/**
 * What the door has to know about a party before it is through the door,
 * rendered under the name on the event card, the registrants page and its
 * phone cards alike (#1511 moved it here so the three cannot drift).
 */
export function RegistrantBadges({
  registrant,
}: {
  registrant: EventRegistrant;
}) {
  return (
    <>
      {/* Beside the name, not in a column, and for the reason the pronouns
          are there: this is read at the same moment as "who is this", it is
          the one thing about a party that has to be known before the day
          rather than at it, and a column would be the first thing dropped on
          a phone. Only `true` renders anything -- null is "nobody was asked"
          and false is the ordinary case, and neither is worth a badge
          (#685). */}
      {registrant.party_includes_minor === true && (
        <StatusBadge tone="info" className="mt-1 font-normal">
          Includes a minor
        </StatusBadge>
      )}
      {/* Same place, same argument, and the condition is inverted (#599).
          For the minors flag the notable state is `true`; here it is `false`
          -- somebody who has asked not to be photographed is the one
          registrant a camera has to know about, and the ordinary case would
          only add noise. Null renders nothing: it is the resting state of
          every registration (#1376), and a badge on every row is a badge
          nobody reads.

          This is also the check-in surface: `check-in-modal.tsx` renders the
          same tab, so the badge is there without a second copy.

          **The badge is the reason #1376 kept the column.** Dropping the
          three columns and the machinery would have deleted this, and
          "photos can be deleted" is a remedy after the fact rather than a
          list the door shift checks before pointing a camera. */}
      {registrant.photo_consent === false && (
        <StatusBadge tone="warning" className="mt-1 font-normal">
          No photos
        </StatusBadge>
      )}
      <AnswerRequestBadge registrant={registrant} />
    </>
  );
}
