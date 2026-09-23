import { describe, expect, test } from "bun:test";
import {
  PHOTO_CONSENT_HEADING,
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
describe("the platform's reader-facing copy", () => {
  // Not consent, anywhere a human reads. Agreement implied by submitting a
  // form is not an unambiguous affirmative act, and a surface that called it
  // consent would misstate the lawful basis.
  test("the word consent appears on no reader-facing string", () => {
    for (const copy of [
      PHOTO_CONSENT_HEADING,
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
