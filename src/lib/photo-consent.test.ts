import { describe, expect, test } from "bun:test";
import {
  PHOTO_CONSENT_HEADING,
  PHOTO_CONSENT_NOTICE,
  PHOTO_CONSENT_UNAVAILABLE_ERROR,
  PHOTO_OBJECTION_ACTION,
  PHOTO_OBJECTION_NONE,
  PHOTO_OBJECTION_RECORDED,
  PHOTO_OBJECTION_WITHDRAWN,
  PHOTO_OBJECTION_WITHDRAW_ACTION,
} from "./photo-consent";

// #599's parser, its form-value helper, its guardian-capacity label and its
// staff label are gone with the box they served (#1376). What is left is
// copy, and the copy is the thing with rules -- rule 2 in test form.
describe("what the platform says beneath a tenant's own paragraphs (#1376)", () => {
  // The three remedies, in the order the sentence has to name them. The
  // self-service one is the narrowest -- `set_my_photo_consent()` resolves
  // through `my_constituent_person_id('events')`, so it reaches only somebody
  // who has claimed an account, and most registrants have not -- so the
  // organizer and the email come first and the third is qualified on having
  // an account rather than promised outright.
  test("names all three objection routes, and qualifies the self-service one", () => {
    expect(PHOTO_CONSENT_NOTICE).toMatch(/organizer/i);
    expect(PHOTO_CONSENT_NOTICE).toMatch(/email us/i);
    expect(PHOTO_CONSENT_NOTICE).toMatch(/registration page/i);

    const organizer = PHOTO_CONSENT_NOTICE.search(/organizer/i);
    const email = PHOTO_CONSENT_NOTICE.search(/email us/i);
    const page = PHOTO_CONSENT_NOTICE.search(/registration page/i);
    expect(organizer).toBeLessThan(page);
    expect(email).toBeLessThan(page);

    expect(PHOTO_CONSENT_NOTICE).toMatch(/if you have an account/i);
  });

  // The absence is the surprising part, and a reader who scans for a control
  // should be told why they will not find one.
  test("says outright that there is no box", () => {
    expect(PHOTO_CONSENT_NOTICE).toMatch(/no box/i);
  });

  // Rule 2. What an organization does with a photo is off-platform and
  // unknowable from this codebase, and since #1376 these paragraphs are also
  // what makes registering carry the agreement -- so the platform's own
  // sentence may describe the mechanism and the remedy and nothing else.
  test("asserts nothing about what the organization does with a photo", () => {
    expect(PHOTO_CONSENT_NOTICE).not.toMatch(
      /instagram|facebook|social|website|newsletter|press|sponsor|funder|grant|publish|share/i,
    );
  });

  // Not consent, anywhere a human reads. Agreement implied by submitting a
  // form is not an unambiguous affirmative act, and a surface that called it
  // consent would misstate the lawful basis.
  test("the word consent appears on no reader-facing string", () => {
    for (const copy of [
      PHOTO_CONSENT_HEADING,
      PHOTO_CONSENT_NOTICE,
      PHOTO_CONSENT_UNAVAILABLE_ERROR,
      PHOTO_OBJECTION_NONE,
      PHOTO_OBJECTION_RECORDED,
      PHOTO_OBJECTION_WITHDRAWN,
      PHOTO_OBJECTION_ACTION,
      PHOTO_OBJECTION_WITHDRAW_ACTION,
    ]) {
      expect(copy).not.toMatch(/consent/i);
    }
  });
});

describe("the objection control's own copy", () => {
  // Null is "no objection on record" and is the resting state of every
  // registration this platform takes, so it has to read as a fact about the
  // record rather than as a gap somebody should fill.
  test("the resting state says what is not on the record, not that nothing is", () => {
    expect(PHOTO_OBJECTION_NONE).toMatch(/haven't asked us not to/i);
    expect(PHOTO_OBJECTION_NONE).not.toMatch(/nothing|yet|not asked you/i);
  });

  // The one state with an operational job says so: an objection nobody can
  // see is the same failure as no objection.
  test("a recorded objection says that staff can see it", () => {
    expect(PHOTO_OBJECTION_RECORDED).toMatch(/running the event/i);
  });

  // The primary action records the objection; withdrawing is offered only
  // once there is something to withdraw.
  test("the actions are in the first person and point in opposite directions", () => {
    expect(PHOTO_OBJECTION_ACTION).toMatch(/don't photograph/i);
    expect(PHOTO_OBJECTION_WITHDRAW_ACTION).toMatch(/changed my mind/i);
  });
});

describe("what the RPC's refusal turns into", () => {
  // Reworded off "no longer asking": nothing asks. A tenant with no
  // paragraphs publishes no notice, so there is nothing to record against --
  // and the message still has to leave the reader a route.
  test("explains the blank slot and still names a route", () => {
    expect(PHOTO_CONSENT_UNAVAILABLE_ERROR).not.toMatch(/no longer asking/i);
    expect(PHOTO_CONSENT_UNAVAILABLE_ERROR).toMatch(/email them/i);
    expect(PHOTO_CONSENT_UNAVAILABLE_ERROR).toMatch(/taken down/i);
  });
});
