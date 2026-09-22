// #599: the photo and media consent question. Most of the cases below are
// about what this module refuses to do -- read an unasked question as a
// decline, read a decline as an absence, and let one adult answer for another.
import { describe, expect, test } from "bun:test";
import {
  PHOTO_CONSENT_FORM_NOTE,
  parsePhotoConsent,
  photoConsentLabel,
  photoConsentLabelForStaff,
  photoConsentValue,
} from "./photo-consent";

describe("parsePhotoConsent", () => {
  test("reads a ticked and an unticked box that were both rendered", () => {
    expect(parsePhotoConsent("on")).toBe(true);
    expect(parsePhotoConsent("off")).toBe(false);
  });

  // The whole point of the column being three-state, and the half that is
  // easiest to get wrong. The component renders nothing at all on a tenant
  // with no scope written, so an absent field means the question was never
  // put. Reading it as a decline invents a refusal; reading it as consent
  // invents permission.
  test("an absent field is unasked, and never a decline", () => {
    for (const raw of [null, "", "   ", "false", "0", "no", "OFF"]) {
      expect(parsePhotoConsent(raw)).toBeNull();
    }
  });

  test("round-trips through the value the box submits", () => {
    expect(parsePhotoConsent(photoConsentValue(true))).toBe(true);
    expect(parsePhotoConsent(photoConsentValue(false))).toBe(false);
  });
});

describe("the question names the person answering it", () => {
  // `party_size` can be more than one, and one adult cannot consent for
  // another adult. If this label ever says "your party", the record starts
  // claiming permission nobody gave.
  test("never speaks for the party", () => {
    for (const includesMinor of [true, false]) {
      const label = photoConsentLabel(includesMinor);
      expect(label).not.toContain("party of");
      expect(label).not.toMatch(/\beveryone\b/i);
      expect(label).toMatch(/\bI\b/);
    }
  });

  test("the plain question is about this registrant alone", () => {
    const label = photoConsentLabel(false);
    expect(label).not.toMatch(/guardian|under.?18|minor/i);
  });

  // #685 gave the form a signal for whether the party includes anyone under
  // 18, so this ticket had to decide what to do with it. It branches the
  // label and not the record: one column, one answer, worded in the capacity
  // `/terms` already claims the adult is answering in.
  test("a party with a minor is answered for in that capacity", () => {
    const label = photoConsentLabel(true);
    expect(label).toMatch(/parent or guardian/i);
    expect(label).toMatch(/under-18s/i);
  });
});

describe("what the platform says on every tenant", () => {
  // Three claims about this software rather than about any organization: a no
  // is kept as a no, staff can see it, and it can be changed afterwards. The
  // last one is load-bearing -- a consent that cannot be withdrawn is not
  // consent, which is the substantive difference from a waiver.
  test("promises that a decline is recorded and can be changed", () => {
    expect(PHOTO_CONSENT_FORM_NOTE).toMatch(/including a no/i);
    expect(PHOTO_CONSENT_FORM_NOTE).toMatch(/change your mind/i);
  });

  // The scope is the organization's and the platform writes none of it, so
  // nothing here may name a destination for a photo.
  test("names no destination for a photo", () => {
    expect(PHOTO_CONSENT_FORM_NOTE).not.toMatch(
      /instagram|facebook|social|website|newsletter|press|sponsor|grant/i,
    );
  });
});

describe("how the portal names the answer", () => {
  test("has no label for a question nobody was asked", () => {
    expect(photoConsentLabelForStaff(null)).toBeNull();
    expect(photoConsentLabelForStaff(true)).toBe("Photos OK");
    expect(photoConsentLabelForStaff(false)).toBe("No photos");
  });
});
