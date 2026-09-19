import { describe, expect, test } from "bun:test";
import {
  autoReplyDefaults,
  autoReplyDefinition,
  mergeAutoReplySlots,
} from "@/lib/notifications/auto-replies";
import {
  hasRemoteImages,
  renderAutoReplyPreview,
  sampleArtworkSubmission,
  sampleContactMessage,
  sampleEventRegistration,
  sampleGearRequest,
  sampleVolunteerApplication,
  withRemoteImagesBlocked,
  type AutoReplyPreviewContext,
} from "@/lib/notifications/auto-reply-preview";
import { renderEventRegistrationConfirmationEmail } from "@/lib/notifications/event-registration-confirmation-email";
import { renderGearRequestConfirmationEmail } from "@/lib/notifications/gear-request-confirmation-email";
import { renderVolunteerApplicationConfirmationEmail } from "@/lib/notifications/volunteer-application-confirmation-email";
import { renderContactMessageConfirmationEmail } from "@/lib/notifications/contact-message-confirmation-email";
import { renderArtworkSubmissionConfirmationEmail } from "@/lib/notifications/artwork-submission-confirmation-email";
import { AUTO_REPLIES } from "@/lib/notifications/auto-replies";
import {
  ARTWORK_SUBMISSION_CONFIRMATION_KIND,
  CONTACT_MESSAGE_CONFIRMATION_KIND,
  EVENT_REGISTRATION_CONFIRMATION_KIND,
  GEAR_REQUEST_CONFIRMATION_KIND,
  VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
} from "@/lib/notifications/kinds";

/**
 * The preview's one promise: it is the sender (#1236).
 *
 * Every assertion below is a version of that. An email an administrator
 * approves in the pane and a different email in the reader's inbox is the
 * failure this whole feature would be worse than useless for, so the first
 * test renders each reply through both paths and compares them whole.
 */

const CONTEXT: AutoReplyPreviewContext = {
  orgName: "Riverside Community Center",
  siteUrl: "https://example.org",
  timeZone: "America/Denver",
  // Pinned, so the sample event's date is the same on both sides of the
  // comparison and the assertions do not move with the calendar.
  now: new Date("2026-09-18T12:00:00.000Z"),
};

describe("the preview renders through the sender", () => {
  test("the event registration confirmation", () => {
    const copy = autoReplyDefaults(
      autoReplyDefinition(EVENT_REGISTRATION_CONFIRMATION_KIND)!,
    );

    expect(
      renderAutoReplyPreview(
        EVENT_REGISTRATION_CONFIRMATION_KIND,
        copy,
        CONTEXT,
      ),
    ).toEqual(
      renderEventRegistrationConfirmationEmail(
        sampleEventRegistration(CONTEXT),
        copy,
      ),
    );
  });

  test("the volunteer application confirmation", () => {
    const copy = autoReplyDefaults(
      autoReplyDefinition(VOLUNTEER_APPLICATION_CONFIRMATION_KIND)!,
    );

    expect(
      renderAutoReplyPreview(
        VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
        copy,
        CONTEXT,
      ),
    ).toEqual(
      renderVolunteerApplicationConfirmationEmail(
        sampleVolunteerApplication(CONTEXT),
        copy,
      ),
    );
  });

  test("the gear request confirmation", () => {
    const copy = autoReplyDefaults(
      autoReplyDefinition(GEAR_REQUEST_CONFIRMATION_KIND)!,
    );

    expect(
      renderAutoReplyPreview(GEAR_REQUEST_CONFIRMATION_KIND, copy, CONTEXT),
    ).toEqual(
      renderGearRequestConfirmationEmail(sampleGearRequest(CONTEXT), copy),
    );
  });

  test("the contact message confirmation", () => {
    const copy = autoReplyDefaults(
      autoReplyDefinition(CONTACT_MESSAGE_CONFIRMATION_KIND)!,
    );

    expect(
      renderAutoReplyPreview(CONTACT_MESSAGE_CONFIRMATION_KIND, copy, CONTEXT),
    ).toEqual(
      renderContactMessageConfirmationEmail(
        sampleContactMessage(CONTEXT),
        copy,
      ),
    );
  });

  test("the artwork submission confirmation", () => {
    const copy = autoReplyDefaults(
      autoReplyDefinition(ARTWORK_SUBMISSION_CONFIRMATION_KIND)!,
    );

    expect(
      renderAutoReplyPreview(
        ARTWORK_SUBMISSION_CONFIRMATION_KIND,
        copy,
        CONTEXT,
      ),
    ).toEqual(
      renderArtworkSubmissionConfirmationEmail(
        sampleArtworkSubmission(CONTEXT),
        copy,
      ),
    );
  });

  test("every registered reply has one, so the editor can never show a blank pane", () => {
    // The guard the two tests above would not have given on their own: a sixth
    // definition added to the registry without a branch here reaches the
    // editor as "no preview", which reads as a rendering failure to the
    // administrator looking at it.
    for (const definition of AUTO_REPLIES) {
      const rendered = renderAutoReplyPreview(
        definition.kind,
        autoReplyDefaults(definition),
        CONTEXT,
      );
      expect(rendered, definition.kind).not.toBeNull();
      expect(rendered!.subject, definition.kind).not.toBe("");
    }
  });

  test("a kind with no sample says so rather than rendering nothing", () => {
    expect(
      renderAutoReplyPreview(
        "not_a_reply",
        autoReplyDefaults(autoReplyDefinition(GEAR_REQUEST_CONFIRMATION_KIND)!),
        CONTEXT,
      ),
    ).toBeNull();
  });
});

describe("what the pane shows", () => {
  const definition = autoReplyDefinition(
    VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
  )!;

  /** One reply previewed with a draft folded over the platform's wording. */
  function preview(overrides: Record<string, string>) {
    return renderAutoReplyPreview(
      VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
      mergeAutoReplySlots(definition, overrides),
      CONTEXT,
    )!;
  }

  test("an unsaved edit is what comes back", () => {
    expect(preview({ subject: "A brand new subject" }).subject).toBe(
      "A brand new subject",
    );
  });

  test("a slot left alone previews the platform's own wording", () => {
    expect(preview({ subject: "Something else" }).text).toContain(
      definition.slots.find((slot) => slot.key === "intro")!.default,
    );
  });

  test("markup in a slot appears literally in both parts", () => {
    const rendered = preview({
      intro: "<script>alert(1)</script> Tea & biscuits",
    });

    // Escaped exactly once in the HTML part -- so a reader sees the characters
    // that were typed, and the browser sees no element.
    expect(rendered.html).toContain(
      "&lt;script&gt;alert(1)&lt;/script&gt; Tea &amp; biscuits",
    );
    expect(rendered.html).not.toContain("<script>");

    // Never escaped in the text part, which is not markup: `&amp;` reaching a
    // plain-text client is the bug this catches.
    expect(rendered.text).toContain("<script>alert(1)</script> Tea & biscuits");
    expect(rendered.text).not.toContain("&amp;");
  });

  test("a token nothing fills in renders empty, as it would in a real send", () => {
    expect(preview({ subject: "Hello {{event_name}}" }).subject).toBe("Hello ");
  });
});

describe("the images-off state", () => {
  test("no images means the toggle would change nothing", () => {
    expect(hasRemoteImages("<p>Hello</p>")).toBe(false);
    expect(
      hasRemoteImages('<img src="https://example.org/logo.png" alt="Us">'),
    ).toBe(true);
  });

  test("a blocked image keeps its element and its alternative text", () => {
    const blocked = withRemoteImagesBlocked(
      '<p><img src="https://example.org/logo.png" alt="Riverside" width="120"></p>',
    );

    // The leading space matters: `data-blocked-src="..."` ends in the string
    // this is looking for, so the attribute boundary is what is asserted.
    expect(blocked).not.toContain(' src="https://example.org/logo.png"');
    expect(blocked).toContain(
      'data-blocked-src="https://example.org/logo.png"',
    );
    expect(blocked).toContain('alt="Riverside"');
    expect(blocked).toContain('width="120"');
  });

  test("every image is blocked, not only the first", () => {
    const blocked = withRemoteImagesBlocked(
      '<img src="https://example.org/a.png"><img src="https://example.org/b.png">',
    );
    expect(blocked).not.toContain(" src=");
  });

  test("today's replies carry no images at all", () => {
    // The branded shell (#1238) is what puts a logo in these; until it lands
    // the pane hides the toggle rather than offering one that does nothing.
    const rendered = renderAutoReplyPreview(
      GEAR_REQUEST_CONFIRMATION_KIND,
      autoReplyDefaults(autoReplyDefinition(GEAR_REQUEST_CONFIRMATION_KIND)!),
      CONTEXT,
    )!;
    expect(hasRemoteImages(rendered.html)).toBe(false);
  });
});

describe("the sample payloads", () => {
  test("the sample event is in the future, so it reads as an invitation", () => {
    const registration = sampleEventRegistration(CONTEXT);
    expect(new Date(registration.startsAt).getTime()).toBeGreaterThan(
      CONTEXT.now!.getTime(),
    );
  });

  test("the tenant's own name is what signs the email, not the registry's", () => {
    const rendered = renderAutoReplyPreview(
      GEAR_REQUEST_CONFIRMATION_KIND,
      autoReplyDefaults(autoReplyDefinition(GEAR_REQUEST_CONFIRMATION_KIND)!),
      { ...CONTEXT, orgName: "Chatter Snow" },
    )!;
    expect(rendered.text).toContain("Chatter Snow");
  });

  test("the token values come from the registry, so they are described once", () => {
    const definition = autoReplyDefinition(
      VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
    )!;
    expect(sampleVolunteerApplication(CONTEXT).referenceCode).toBe(
      definition.sample.reference_code,
    );
  });
});
