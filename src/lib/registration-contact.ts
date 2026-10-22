import {
  INSTAGRAM_HANDLE_ERROR,
  INSTAGRAM_HANDLE_PATTERN,
} from "@/lib/instagram-handle";

/**
 * "Require an Instagram handle" at registration, or a preferred way to be
 * reached instead (#1647).
 *
 * A per-tenant setting, `registration.requires_instagram`, off unless a tenant
 * turns it on. On, both registration forms require a handle, and offer
 * "I don't have Instagram" for somebody who does not use it: ticking it hides
 * the handle and asks how they would like to be reached and where.
 *
 * `resolve_registration_contact()` in the database is the rule. Everything
 * here mirrors it so a form can say what is missing before it posts, and the
 * RPC refuses anything that skips this.
 */

export const PREFERRED_CONTACT_METHODS = [
  { value: "text", label: "Text message", short: "Text" },
  { value: "call", label: "Phone call", short: "Call" },
  { value: "email", label: "Email", short: "Email" },
  { value: "whatsapp", label: "WhatsApp", short: "WhatsApp" },
  { value: "other", label: "Other", short: "Other" },
] as const;

export type PreferredContactMethod =
  (typeof PREFERRED_CONTACT_METHODS)[number]["value"];

export const PREFERRED_CONTACT_DETAIL_MAX = 200;

export const NO_INSTAGRAM_LABEL = "I don't have Instagram";

export const REGISTRATION_CONTACT_HEADING = "How we'll reach you";

export function isPreferredContactMethod(
  value: unknown,
): value is PreferredContactMethod {
  return PREFERRED_CONTACT_METHODS.some((method) => method.value === value);
}

export function preferredContactMethodLabel(
  value: string | null | undefined,
): string | null {
  return (
    PREFERRED_CONTACT_METHODS.find((method) => method.value === value)?.label ??
    null
  );
}

/** "Text", "Call" -- for the registrants list's "No IG · Text". */
export function preferredContactMethodShort(
  value: string | null | undefined,
): string | null {
  return (
    PREFERRED_CONTACT_METHODS.find((method) => method.value === value)?.short ??
    null
  );
}

/** What the detail field is called for a method. */
export function preferredContactDetailLabel(
  method: string | null | undefined,
): string {
  switch (method) {
    case "email":
      return "Email address";
    case "other":
      return "How to reach you";
    default:
      return "Phone number";
  }
}

/** Email is the one method whose detail can be left to the registration. */
export const EMAIL_DETAIL_DESCRIPTION =
  "Leave blank to use the email you registered with.";

/** The stored shape, as the four columns hold it. */
export type RegistrationContact = {
  instagram_handle: string | null;
  has_no_instagram: boolean | null;
  preferred_contact_method: string | null;
  preferred_contact_detail: string | null;
};

export const NO_REGISTRATION_CONTACT: RegistrationContact = {
  instagram_handle: null,
  has_no_instagram: null,
  preferred_contact_method: null,
  preferred_contact_detail: null,
};

/** The form's state: strings, so a select can be unanswered. */
export type ContactValues = {
  instagramHandle: string;
  hasNoInstagram: boolean;
  method: string;
  detail: string;
};

export const EMPTY_CONTACT_VALUES: ContactValues = {
  instagramHandle: "",
  hasNoInstagram: false,
  method: "",
  detail: "",
};

/** A stored answer as the form's state, for an editor that starts from it. */
export function contactValuesFrom(
  contact: Partial<RegistrationContact>,
): ContactValues {
  return {
    instagramHandle: contact.instagram_handle ?? "",
    hasNoInstagram: contact.has_no_instagram === true,
    method: contact.preferred_contact_method ?? "",
    detail: contact.preferred_contact_detail ?? "",
  };
}

/** The form field names, shared by the forms and the parser. */
export const CONTACT_FIELDS = {
  /** Set by a form that required the answer, as `MINORS_ASKED_FIELD` is. */
  required: "instagramRequired",
  instagramHandle: "instagramHandle",
  hasNoInstagram: "noInstagram",
  method: "preferredContactMethod",
  detail: "preferredContactDetail",
} as const;

export const INSTAGRAM_OR_CONTACT_REQUIRED_CODE =
  "INSTAGRAM_OR_CONTACT_REQUIRED";

export const REGISTRATION_CONTACT_ERROR_MESSAGES: Record<string, string> = {
  [INSTAGRAM_OR_CONTACT_REQUIRED_CODE]:
    "Please give your Instagram handle, or tick “I don't have Instagram” and tell us how to reach you.",
  INSTAGRAM_HANDLE_INVALID: INSTAGRAM_HANDLE_ERROR,
  PREFERRED_CONTACT_INVALID: `Please choose how to reach you, with a number or address of at most ${PREFERRED_CONTACT_DETAIL_MAX} characters.`,
  CONTACT_NOT_ASKED: "This organization doesn't ask for this any more.",
};

/** The RPC codes above, for routing an error to the step that asked. */
export const REGISTRATION_CONTACT_ERROR_CODES = Object.keys(
  REGISTRATION_CONTACT_ERROR_MESSAGES,
);

function bareHandle(raw: string): string {
  return raw.trim().replace(/^@/, "");
}

/**
 * What is wrong with the form's answer, or null. `required` is the tenant's
 * setting: off, only a handle that is not one is refused, as before.
 */
export function contactError(
  values: ContactValues,
  required: boolean,
): string | null {
  if (values.hasNoInstagram) {
    const detail = values.detail.trim();
    if (
      (values.method && !isPreferredContactMethod(values.method)) ||
      detail.length > PREFERRED_CONTACT_DETAIL_MAX
    ) {
      return REGISTRATION_CONTACT_ERROR_MESSAGES.PREFERRED_CONTACT_INVALID;
    }
    if (!required) return null;
    if (!isPreferredContactMethod(values.method)) {
      return "Please choose how you'd like us to reach you.";
    }
    if (!detail && values.method !== "email") {
      return `Please give us your ${preferredContactDetailLabel(values.method).toLowerCase()}.`;
    }
    return null;
  }
  const handle = bareHandle(values.instagramHandle);
  if (handle && !INSTAGRAM_HANDLE_PATTERN.test(handle)) {
    return INSTAGRAM_HANDLE_ERROR;
  }
  if (required && !handle) {
    return REGISTRATION_CONTACT_ERROR_MESSAGES[
      INSTAGRAM_OR_CONTACT_REQUIRED_CODE
    ];
  }
  return null;
}

/**
 * Puts the answer on a FormData. With the box ticked the handle is not sent:
 * it was hidden, and whatever was typed before ticking is not an answer.
 */
export function setContactFields(
  formData: FormData,
  values: ContactValues,
  required: boolean,
): void {
  if (required) formData.set(CONTACT_FIELDS.required, "on");
  if (required && values.hasNoInstagram) {
    formData.set(CONTACT_FIELDS.hasNoInstagram, "on");
    formData.set(CONTACT_FIELDS.method, values.method);
    formData.set(CONTACT_FIELDS.detail, values.detail);
    return;
  }
  formData.set(CONTACT_FIELDS.instagramHandle, values.instagramHandle);
}

export type ParsedContact = RegistrationContact;

/**
 * The answer off a form, as the RPC parameters take it. Where the form did not
 * require it, the handle is optional and the rest null -- what the RPC stores
 * on a tenant with the setting off anyway.
 */
export function parseRegistrationContact(
  formData: FormData,
): { data: ParsedContact } | { error: string; field: "instagramHandle" } {
  const required = formData.get(CONTACT_FIELDS.required) === "on";
  const values: ContactValues = {
    instagramHandle: String(formData.get(CONTACT_FIELDS.instagramHandle) ?? ""),
    hasNoInstagram: formData.get(CONTACT_FIELDS.hasNoInstagram) === "on",
    method: String(formData.get(CONTACT_FIELDS.method) ?? "").trim(),
    detail: String(formData.get(CONTACT_FIELDS.detail) ?? "").trim(),
  };
  const message = contactError(values, required);
  if (message) return { error: message, field: "instagramHandle" };

  if (required && values.hasNoInstagram) {
    return {
      data: {
        instagram_handle: null,
        has_no_instagram: true,
        preferred_contact_method: values.method,
        preferred_contact_detail: values.detail || null,
      },
    };
  }
  return {
    data: {
      ...NO_REGISTRATION_CONTACT,
      instagram_handle: bareHandle(values.instagramHandle) || null,
    },
  };
}

/**
 * The answer as one line: "@handle", "Text message · 555 0100", or
 * "Email · the email you registered with". Null where there is none.
 * `detail: false` leaves the number out, for a reader not to be shown it;
 * `ownEmail` is what a blank email detail reads as.
 */
export function formatRegistrationContact(
  contact: Partial<RegistrationContact>,
  {
    detail = true,
    ownEmail = "the email you registered with",
  }: { detail?: boolean; ownEmail?: string } = {},
): string | null {
  if (contact.has_no_instagram) {
    const method = preferredContactMethodLabel(
      contact.preferred_contact_method,
    );
    if (!method) return "No Instagram";
    if (!detail) return method;
    const value =
      contact.preferred_contact_detail?.trim() ||
      (contact.preferred_contact_method === "email" ? ownEmail : "");
    return value ? `${method} · ${value}` : method;
  }
  const handle = contact.instagram_handle?.trim();
  return handle ? `@${handle}` : null;
}
