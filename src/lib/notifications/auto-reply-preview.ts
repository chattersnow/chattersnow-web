import {
  autoReplyDefinition,
  type AutoReplyCopy,
} from "@/lib/notifications/auto-replies";
import {
  renderEventRegistrationConfirmationEmail,
  type EventRegistrationConfirmation,
} from "@/lib/notifications/event-registration-confirmation-email";
import {
  renderGearRequestConfirmationEmail,
  type GearRequestConfirmation,
} from "@/lib/notifications/gear-request-confirmation-email";
import {
  renderVolunteerApplicationConfirmationEmail,
  type VolunteerApplicationConfirmation,
} from "@/lib/notifications/volunteer-application-confirmation-email";
import {
  renderContactMessageConfirmationEmail,
  type ContactMessageConfirmation,
} from "@/lib/notifications/contact-message-confirmation-email";
import {
  renderArtworkSubmissionConfirmationEmail,
  type ArtworkSubmissionConfirmation,
} from "@/lib/notifications/artwork-submission-confirmation-email";
import { contactTopicLabel } from "@/lib/contact-topics";
import {
  ARTWORK_SUBMISSION_CONFIRMATION_KIND,
  CONTACT_MESSAGE_CONFIRMATION_KIND,
  EVENT_REGISTRATION_CONFIRMATION_KIND,
  GEAR_REQUEST_CONFIRMATION_KIND,
  VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
} from "@/lib/notifications/kinds";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";

/**
 * A stand-in submission for each automatic reply, so the editor can show what
 * one looks like without anybody filling in the public form (#1236, epic
 * #1232).
 *
 * The one rule this file exists to keep: **there is no second renderer.** It
 * fabricates a payload and hands it to the very function the sender calls, so
 * a preview that agrees with the editor but not with the inbox is not
 * expressible here. A preview nobody can trust is worse than none, because it
 * is the thing an administrator checks their wording against before publishing
 * it to the public.
 *
 * The token values come from the registry's own `sample` (#1233) rather than
 * from a copy kept here, for the same reason: the tokens a slot offers and the
 * values they stand for should be described once. What the registry cannot
 * answer is the rest of the payload -- an event needs a date and a place, a
 * gear request needs items -- and that is what the sample builders below are.
 *
 * No `server-only` and no Supabase client. The renderers are plain functions,
 * so this is unit-testable under `bun run test` and the equality test that
 * pins the preview to the sender costs no stack.
 */

export type AutoReplyPreviewContext = {
  /** The tenant's own name, so the sign-off reads as theirs and not a sample's. */
  orgName: string;
  /** The tenant's origin, from tenantMailContext(); the links are built on it. */
  siteUrl: string;
  /**
   * The zone the sample event's times read in. The org timezone rather than a
   * fixed one: every time in this email is rendered in the *event's* own zone
   * (#1057), and a tenant's own events are overwhelmingly in their own.
   */
  timeZone: string;
  /**
   * What "now" is, so the sample event falls in the near future rather than on
   * a fixed date that will read as stale. Injectable so a test can pin it.
   */
  now?: Date;
};

/**
 * Ten days out, at 17:00 UTC. Far enough ahead to read as a real invitation,
 * and a whole-hour start in most zones rather than a ragged "10:37".
 */
const SAMPLE_EVENT_LEAD_DAYS = 10;
const SAMPLE_EVENT_HOURS = 2;

function sampleEventStart(now: Date): Date {
  const start = new Date(now.getTime());
  start.setUTCDate(start.getUTCDate() + SAMPLE_EVENT_LEAD_DAYS);
  start.setUTCHours(17, 0, 0, 0);
  return start;
}

/**
 * The token values the registry publishes for this kind, as a plain record.
 *
 * An unknown kind has none, and the callers below only ever pass kinds this
 * file has a branch for, so the empty object is unreachable in practice --
 * it exists so a sample builder can read a value without a non-null assertion.
 */
function sampleTokens(kind: string): Record<string, string> {
  return autoReplyDefinition(kind)?.sample ?? {};
}

/** The registration the event confirmation is previewed against. */
export function sampleEventRegistration(
  context: AutoReplyPreviewContext,
): EventRegistrationConfirmation {
  const tokens = sampleTokens(EVENT_REGISTRATION_CONFIRMATION_KIND);
  const startsAt = sampleEventStart(context.now ?? new Date());
  const endsAt = new Date(
    startsAt.getTime() + SAMPLE_EVENT_HOURS * 60 * 60 * 1000,
  );

  return {
    orgName: context.orgName,
    registrantName: tokens.first_name ?? "",
    eventName: tokens.event_name ?? "",
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timeZone: context.timeZone,
    location: "The Base Lodge, 1 Mountain Road",
    // More than one, so the party-size line reads in its plural form -- the
    // branch a tenant is least likely to have seen.
    partySize: 2,
    eventId: "00000000-0000-4000-8000-000000000001",
    siteUrl: context.siteUrl,
  };
}

/** The application the volunteer confirmation is previewed against. */
export function sampleVolunteerApplication(
  context: AutoReplyPreviewContext,
): VolunteerApplicationConfirmation {
  const tokens = sampleTokens(VOLUNTEER_APPLICATION_CONFIRMATION_KIND);
  return {
    orgName: context.orgName,
    applicantName: tokens.first_name ?? "",
    referenceCode: tokens.reference_code ?? "",
    siteUrl: context.siteUrl,
  };
}

/** The request the gear confirmation is previewed against. */
export function sampleGearRequest(
  context: AutoReplyPreviewContext,
): GearRequestConfirmation {
  const tokens = sampleTokens(GEAR_REQUEST_CONFIRMATION_KIND);
  return {
    orgName: context.orgName,
    requesterName: tokens.first_name ?? "",
    items: ["Snowboard — 152cm", "Boots — size 9", "Helmet — medium"],
    deliveryMethod: "meetup",
    // The generic sentence a tenant that has written no instructions gets, so
    // the preview never shows wording the tenant did not choose as if it were
    // theirs.
    instructions: "We'll be in touch to arrange a time and place to meet.",
    paymentMethod: null,
  };
}

/** The message the contact acknowledgement is previewed against. */
export function sampleContactMessage(
  context: AutoReplyPreviewContext,
): ContactMessageConfirmation {
  const tokens = sampleTokens(CONTACT_MESSAGE_CONFIRMATION_KIND);
  return {
    orgName: context.orgName,
    senderName: tokens.first_name ?? "",
    // The platform's own label for the topic every contact form offers.
    // Deliberately not resolved through the tenant's lexicon: the only topic
    // whose label they own is the one about what they lend (#896), and a
    // sample that picked that one would show a preview whose detail rows
    // change meaning with an unrelated setting.
    topicLabel: contactTopicLabel("general"),
    // Now, because the row this stands in for is always minutes old: the
    // acknowledgement goes out from the same after() block as the insert.
    receivedAt: (context.now ?? new Date()).toISOString(),
    timeZone: context.timeZone,
  };
}

/** The submission the artwork acknowledgement is previewed against. */
export function sampleArtworkSubmission(
  context: AutoReplyPreviewContext,
): ArtworkSubmissionConfirmation {
  const tokens = sampleTokens(ARTWORK_SUBMISSION_CONFIRMATION_KIND);
  return {
    orgName: context.orgName,
    artistName: tokens.first_name ?? "",
    callTitle: "Winter Open Call",
    title: "Snowline",
    // More than one, so the count reads in its plural form -- the branch a
    // tenant is least likely to have seen.
    imageCount: 3,
  };
}

/**
 * One automatic reply, rendered the way the sender would render it.
 *
 * `copy` is the *resolved* slots -- the tenant's draft folded over the
 * platform's defaults (mergeAutoReplySlots) -- so unsaved edits are what comes
 * back. Unvalidated on purpose: a slot holding a token nothing fills in
 * renders empty here exactly as it would in a real send, which is the whole
 * reason to look before saving.
 *
 * Null for a kind with no sample payload, which can only be a registry entry
 * added without a branch here. The caller says so rather than showing an
 * empty pane that looks like a rendering failure.
 */
export function renderAutoReplyPreview(
  kind: string,
  copy: AutoReplyCopy,
  context: AutoReplyPreviewContext,
): RenderedEmail | null {
  switch (kind) {
    case EVENT_REGISTRATION_CONFIRMATION_KIND:
      return renderEventRegistrationConfirmationEmail(
        sampleEventRegistration(context),
        copy,
      );
    case VOLUNTEER_APPLICATION_CONFIRMATION_KIND:
      return renderVolunteerApplicationConfirmationEmail(
        sampleVolunteerApplication(context),
        copy,
      );
    case GEAR_REQUEST_CONFIRMATION_KIND:
      return renderGearRequestConfirmationEmail(
        sampleGearRequest(context),
        copy,
      );
    case CONTACT_MESSAGE_CONFIRMATION_KIND:
      return renderContactMessageConfirmationEmail(
        sampleContactMessage(context),
        copy,
      );
    case ARTWORK_SUBMISSION_CONFIRMATION_KIND:
      return renderArtworkSubmissionConfirmationEmail(
        sampleArtworkSubmission(context),
        copy,
      );
    default:
      return null;
  }
}

/**
 * The same HTML with every remote image left unloaded, for the state most
 * inboxes actually open an email in.
 *
 * Gmail, Outlook and Apple Mail all block remote images until the reader says
 * otherwise, so the version an administrator will never see by accident is the
 * one they most need to check -- an email whose only sign of who sent it is a
 * logo says nothing at all in that state.
 *
 * The `src` is moved to `data-blocked-src` rather than removed, so an
 * alternative text attribute still has an element to render on, which is
 * exactly what a real client shows. Safe as a regular expression because the
 * input is this application's own renderers' output and never a document from
 * outside; it is not, and must not become, a sanitizer.
 */
export function withRemoteImagesBlocked(html: string): string {
  return html.replace(
    /(<img\b[^>]*?)\ssrc=(")([^"]*)"/gi,
    (_match, before: string, quote: string, value: string) =>
      `${before} data-blocked-src=${quote}${value}${quote}`,
  );
}

/** Whether an images-off toggle would change anything about this email. */
export function hasRemoteImages(html: string): boolean {
  return /<img\b/i.test(html);
}
