import { describe, expect, test } from "bun:test";
import {
  CONTACT_FIELDS,
  contactError,
  EMPTY_CONTACT_VALUES,
  formatRegistrationContact,
  parseRegistrationContact,
  setContactFields,
  type ContactValues,
} from "./registration-contact";

const values = (patch: Partial<ContactValues>): ContactValues => ({
  ...EMPTY_CONTACT_VALUES,
  ...patch,
});

describe("contactError", () => {
  test("off, only a handle that is not one is refused", () => {
    expect(contactError(EMPTY_CONTACT_VALUES, false)).toBeNull();
    expect(
      contactError(values({ instagramHandle: "@jamie" }), false),
    ).toBeNull();
    expect(
      contactError(values({ instagramHandle: "not a handle" }), false),
    ).not.toBeNull();
  });

  test("on, a handle or a complete no-Instagram contact is required", () => {
    expect(contactError(EMPTY_CONTACT_VALUES, true)).toContain("Instagram");
    expect(contactError(values({ instagramHandle: "jamie" }), true)).toBeNull();
    expect(contactError(values({ hasNoInstagram: true }), true)).toContain(
      "choose",
    );
    expect(
      contactError(values({ hasNoInstagram: true, method: "text" }), true),
    ).toContain("phone number");
    expect(
      contactError(
        values({ hasNoInstagram: true, method: "text", detail: "555 0100" }),
        true,
      ),
    ).toBeNull();
  });

  test("email may leave the detail blank", () => {
    expect(
      contactError(values({ hasNoInstagram: true, method: "email" }), true),
    ).toBeNull();
  });

  test("the box hides the handle, so a junk handle typed before it is ignored", () => {
    expect(
      contactError(
        values({
          instagramHandle: "not a handle",
          hasNoInstagram: true,
          method: "email",
        }),
        true,
      ),
    ).toBeNull();
  });

  test("an unknown method or an over-long detail is refused even for staff", () => {
    expect(
      contactError(values({ hasNoInstagram: true, method: "pigeon" }), false),
    ).not.toBeNull();
    expect(
      contactError(
        values({
          hasNoInstagram: true,
          method: "other",
          detail: "x".repeat(201),
        }),
        false,
      ),
    ).not.toBeNull();
    expect(contactError(values({ hasNoInstagram: true }), false)).toBeNull();
  });
});

describe("setContactFields and parseRegistrationContact", () => {
  function roundTrip(input: ContactValues, required: boolean) {
    const formData = new FormData();
    setContactFields(formData, input, required);
    return { formData, parsed: parseRegistrationContact(formData) };
  }

  test("off: the handle alone, bare, and nulls for the rest", () => {
    const { formData, parsed } = roundTrip(
      values({
        instagramHandle: "@jamie.rides",
        hasNoInstagram: true,
        method: "text",
      }),
      false,
    );
    expect(formData.get(CONTACT_FIELDS.required)).toBeNull();
    expect(formData.get(CONTACT_FIELDS.hasNoInstagram)).toBeNull();
    expect(parsed).toEqual({
      data: {
        instagram_handle: "jamie.rides",
        has_no_instagram: null,
        preferred_contact_method: null,
        preferred_contact_detail: null,
      },
    });
  });

  test("on, with a handle", () => {
    expect(
      roundTrip(values({ instagramHandle: "jamie" }), true).parsed,
    ).toEqual({
      data: {
        instagram_handle: "jamie",
        has_no_instagram: null,
        preferred_contact_method: null,
        preferred_contact_detail: null,
      },
    });
  });

  test("on, without Instagram: no handle is sent", () => {
    const { formData, parsed } = roundTrip(
      values({
        instagramHandle: "typed.before",
        hasNoInstagram: true,
        method: "whatsapp",
        detail: " +1 555 0100 ",
      }),
      true,
    );
    expect(formData.get(CONTACT_FIELDS.instagramHandle)).toBeNull();
    expect(parsed).toEqual({
      data: {
        instagram_handle: null,
        has_no_instagram: true,
        preferred_contact_method: "whatsapp",
        preferred_contact_detail: "+1 555 0100",
      },
    });
  });

  test("on, with nothing: refused on the handle's field", () => {
    expect(roundTrip(EMPTY_CONTACT_VALUES, true).parsed).toMatchObject({
      field: "instagramHandle",
    });
  });
});

describe("formatRegistrationContact", () => {
  test("a handle, a method and detail, or the registration's own email", () => {
    expect(formatRegistrationContact({ instagram_handle: "jamie" })).toBe(
      "@jamie",
    );
    expect(
      formatRegistrationContact({
        has_no_instagram: true,
        preferred_contact_method: "text",
        preferred_contact_detail: "555 0100",
      }),
    ).toBe("Text message · 555 0100");
    expect(
      formatRegistrationContact({
        has_no_instagram: true,
        preferred_contact_method: "email",
      }),
    ).toBe("Email · the email you registered with");
    expect(formatRegistrationContact({})).toBeNull();
  });

  test("without the detail, for a reader not to be shown it", () => {
    expect(
      formatRegistrationContact(
        {
          has_no_instagram: true,
          preferred_contact_method: "call",
          preferred_contact_detail: "555 0100",
        },
        { detail: false },
      ),
    ).toBe("Phone call");
  });
});
