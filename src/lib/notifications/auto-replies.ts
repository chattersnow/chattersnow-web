import {
  EVENT_REGISTRATION_CONFIRMATION_KIND,
  GEAR_REQUEST_CONFIRMATION_KIND,
  VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
} from "@/lib/notifications/kinds";

/**
 * The automatic replies a tenant may write for itself (#1233, epic #1232),
 * as copy slots around a fixed core.
 *
 * A tenant writes the subject, the greeting, the intro, the closing and the
 * sign-off. The platform keeps rendering the facts -- the event detail rows,
 * the reference code, the item list, the links, the calendar attachment --
 * and keeps escaping everything. Handing over the whole body as one template
 * was considered and rejected: it needs a templating language, token
 * validation and a sanitizer, and it lets an administrator delete
 * {{reference_code}}, which is the only key to /get-involved/volunteer/status.
 *
 * Zero runtime imports beyond the kinds registry, which has none itself --
 * the same rule as @/lib/notifications/kinds and @/lib/gear-requests. The
 * editor (#1235) is a client component and the sender is `server-only`, and
 * both need this file.
 *
 * Branding is deliberately not here. The logo, the header and the link colour
 * come from the tenant's `brand.*` tokens through the shared email shell
 * (#1238). A slot is a sentence; the shell is the paper it is printed on.
 */

/** The five slots, in the order they render. */
export const AUTO_REPLY_SLOT_KEYS = [
  "subject",
  "greeting",
  "intro",
  "closing",
  "signoff",
] as const;

export type AutoReplySlotKey = (typeof AUTO_REPLY_SLOT_KEYS)[number];

/** One resolved reply: every slot present, tokens not yet substituted. */
export type AutoReplyCopy = Record<AutoReplySlotKey, string>;

/**
 * Every token any reply may offer. Which of them a given slot accepts is the
 * slot's own `tokens` list -- {{event_name}} means nothing on a volunteer
 * application.
 */
export const AUTO_REPLY_TOKENS = [
  "org_name",
  "first_name",
  "event_name",
  "reference_code",
] as const;

export type AutoReplyToken = (typeof AUTO_REPLY_TOKENS)[number];

/**
 * What each token means, for the editor's field help (#1235).
 *
 * `first_name` is named for what it reads like in a greeting, not for what it
 * always holds: every public form collects one free-text name field, so a
 * person who typed "Alexandra Whitfield" gets that whole string. The platform
 * deliberately does not split it -- "Hi Alexandra," is a different email from
 * the one this application has been sending, and the defaults here are
 * today's wording verbatim.
 */
export const AUTO_REPLY_TOKEN_DESCRIPTIONS: Record<AutoReplyToken, string> = {
  org_name: "Your organization's name.",
  first_name:
    "The name the person gave on the form. Blank when they left it empty.",
  event_name: "The name of the event they registered for.",
  reference_code: "The code that looks their application up.",
};

/** A line -- a subject, a greeting, a sign-off. */
export const AUTO_REPLY_LINE_MAX_LENGTH = 200;

/** A paragraph -- an intro, a closing. */
export const AUTO_REPLY_PARAGRAPH_MAX_LENGTH = 1000;

export type AutoReplySlot = {
  key: AutoReplySlotKey;
  label: string;
  /** What this slot is for, shown under the field. */
  description: string;
  shape: "line" | "paragraph";
  maxLength: number;
  /** Today's copy, verbatim. */
  default: string;
  /** Which tokens are allowed here. */
  tokens: AutoReplyToken[];
  /**
   * Used when every token in the slot resolves empty -- how "Hi
   * {{first_name}}," stays "Hi," for an anonymous submitter. A slot holding no
   * token at all never uses it: there was nothing to resolve.
   */
  fallbackWhenTokensEmpty?: string;
};

export type AutoReplyDefinition = {
  kind: string;
  label: string;
  description: string;
  /** The NOTIFICATION_KINDS key whose opt-out still governs it. */
  notificationKind: string;
  /** For grouping in the editor: events / volunteers / inventory. */
  module: string;
  slots: AutoReplySlot[];
  /** Token values for the preview (#1236). */
  sample: Record<string, string>;
};

/** The greeting, which is the same slot in all three replies. */
function greetingSlot(tokens: AutoReplyToken[]): AutoReplySlot {
  return {
    key: "greeting",
    label: "Greeting",
    description:
      "The first line. Ends with a comma in every default; whatever you write is used as-is.",
    shape: "line",
    maxLength: AUTO_REPLY_LINE_MAX_LENGTH,
    default: "Hi {{first_name}},",
    tokens,
    // Somebody who left the name field blank must not be greeted "Hi ,".
    fallbackWhenTokensEmpty: "Hi,",
  };
}

/** The sign-off, likewise. */
function signoffSlot(tokens: AutoReplyToken[]): AutoReplySlot {
  return {
    key: "signoff",
    label: "Sign-off",
    description: "The last line, under the details.",
    shape: "line",
    maxLength: AUTO_REPLY_LINE_MAX_LENGTH,
    default: "— {{org_name}}",
    tokens,
  };
}

/**
 * The three replies this application already sends. #1237 adds the two it
 * does not -- the contact form and artwork submissions, which answer their
 * senders with silence today.
 *
 * Every default is lifted verbatim from the renderer it replaces, so a tenant
 * that writes nothing gets byte-identically the email it got before (#1234
 * asserts exactly that). A default of "" is a slot the platform has never
 * rendered and the tenant may fill in -- not an oversight.
 */
export const AUTO_REPLIES: AutoReplyDefinition[] = [
  {
    kind: EVENT_REGISTRATION_CONFIRMATION_KIND,
    label: "Event registration confirmation",
    description:
      "Sent to somebody as soon as they register for one of your public events. The date, the place, the party size and the calendar attachment are added by the platform.",
    notificationKind: EVENT_REGISTRATION_CONFIRMATION_KIND,
    module: "events",
    slots: [
      {
        key: "subject",
        label: "Subject",
        description: "The subject line of the email.",
        shape: "line",
        maxLength: AUTO_REPLY_LINE_MAX_LENGTH,
        default: "You're registered for {{event_name}}",
        tokens: ["org_name", "first_name", "event_name"],
      },
      greetingSlot(["org_name", "first_name", "event_name"]),
      {
        key: "intro",
        label: "Intro",
        description: "The paragraph above the event details.",
        shape: "paragraph",
        maxLength: AUTO_REPLY_PARAGRAPH_MAX_LENGTH,
        default: "You're registered for {{event_name}}. Here are the details:",
        tokens: ["org_name", "first_name", "event_name"],
      },
      {
        key: "closing",
        label: "Closing",
        description:
          "The paragraph under the details, after the link and the calendar note.",
        shape: "paragraph",
        maxLength: AUTO_REPLY_PARAGRAPH_MAX_LENGTH,
        default:
          "If you can no longer make it, let us know so we can free up your spot.",
        tokens: ["org_name", "first_name", "event_name"],
      },
      signoffSlot(["org_name", "first_name", "event_name"]),
    ],
    sample: {
      org_name: "Riverside Community Center",
      first_name: "Alexandra Whitfield",
      event_name: "Spring Tune-Up Day at the Base Lodge",
    },
  },
  {
    kind: VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
    label: "Volunteer application confirmation",
    description:
      "Sent to somebody as soon as they apply to volunteer. The reference code, the note to keep the email and the link to the status page are added by the platform — the code is the only key to that page.",
    notificationKind: VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
    module: "volunteers",
    slots: [
      {
        key: "subject",
        label: "Subject",
        description: "The subject line of the email.",
        shape: "line",
        maxLength: AUTO_REPLY_LINE_MAX_LENGTH,
        default: "Your application — {{org_name}}",
        tokens: ["org_name", "first_name", "reference_code"],
      },
      greetingSlot(["org_name", "first_name", "reference_code"]),
      {
        key: "intro",
        label: "Intro",
        description: "The paragraph above the reference code.",
        shape: "paragraph",
        maxLength: AUTO_REPLY_PARAGRAPH_MAX_LENGTH,
        default:
          "Thanks for applying. We have your application and we'll be in touch about next steps.",
        tokens: ["org_name", "first_name", "reference_code"],
      },
      {
        key: "closing",
        label: "Closing",
        description:
          "An optional paragraph under the code and the status link. Empty by default.",
        shape: "paragraph",
        maxLength: AUTO_REPLY_PARAGRAPH_MAX_LENGTH,
        default: "",
        tokens: ["org_name", "first_name", "reference_code"],
      },
      signoffSlot(["org_name", "first_name", "reference_code"]),
    ],
    sample: {
      org_name: "Riverside Community Center",
      first_name: "Alexandra Whitfield",
      reference_code: "K7QZ4MRT",
    },
  },
  {
    kind: GEAR_REQUEST_CONFIRMATION_KIND,
    label: "Gear request confirmation",
    description:
      "Sent to somebody as soon as they request items from the public library. The item list and your meetup or shipping instructions are added by the platform.",
    notificationKind: GEAR_REQUEST_CONFIRMATION_KIND,
    module: "inventory",
    slots: [
      {
        key: "subject",
        label: "Subject",
        description: "The subject line of the email.",
        shape: "line",
        maxLength: AUTO_REPLY_LINE_MAX_LENGTH,
        default: "We received your request — {{org_name}}",
        tokens: ["org_name", "first_name"],
      },
      greetingSlot(["org_name", "first_name"]),
      {
        key: "intro",
        label: "Intro",
        description: "The paragraph above the list of items.",
        shape: "paragraph",
        maxLength: AUTO_REPLY_PARAGRAPH_MAX_LENGTH,
        default:
          "Thanks for your request. These items are now on hold for you and no longer available to others:",
        tokens: ["org_name", "first_name"],
      },
      {
        key: "closing",
        label: "Closing",
        description:
          "An optional paragraph under your meetup or shipping instructions. Empty by default.",
        shape: "paragraph",
        maxLength: AUTO_REPLY_PARAGRAPH_MAX_LENGTH,
        default: "",
        tokens: ["org_name", "first_name"],
      },
      signoffSlot(["org_name", "first_name"]),
    ],
    sample: {
      org_name: "Riverside Community Center",
      first_name: "Alexandra Whitfield",
    },
  },
];

export function autoReplyDefinition(
  kind: string,
): AutoReplyDefinition | undefined {
  return AUTO_REPLIES.find((definition) => definition.kind === kind);
}

/** The platform's own wording for one reply, with no tenant row folded in. */
export function autoReplyDefaults(
  definition: AutoReplyDefinition,
): AutoReplyCopy {
  return mergeAutoReplySlots(definition, null);
}

/** Every slot empty. What an unknown kind resolves to; see the resolver. */
export function emptyAutoReplyCopy(): AutoReplyCopy {
  return Object.fromEntries(
    AUTO_REPLY_SLOT_KEYS.map((key) => [key, ""]),
  ) as AutoReplyCopy;
}

/**
 * A tenant's saved slots folded over the platform's defaults.
 *
 * The sparseness is the whole point, so the two cases that look alike are
 * kept apart: a key that is absent means the tenant never touched this slot
 * and still wants ours, while a key holding "" means they deliberately
 * blanked it. Anything that is not a string -- a null, a number, whatever a
 * hand-written row holds -- is treated as absent rather than rendered.
 */
export function mergeAutoReplySlots(
  definition: AutoReplyDefinition,
  saved: unknown,
): AutoReplyCopy {
  const rows =
    saved && typeof saved === "object" && !Array.isArray(saved)
      ? (saved as Record<string, unknown>)
      : {};

  const copy = emptyAutoReplyCopy();
  for (const slot of definition.slots) {
    const value = rows[slot.key];
    copy[slot.key] = typeof value === "string" ? value : slot.default;
  }
  return copy;
}

/** `{{token}}`, with any amount of space inside the braces. */
const TOKEN_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * Substitute token values into one slot's text.
 *
 * Plain text only, and that is deliberate: slot text and token values are
 * both untrusted text -- a tenant admin typed one and a member of the public
 * typed the other -- and escaping happens once, later, when the HTML part is
 * composed (#1234). Escaping here would show a reader `&amp;` where they
 * wrote `&`.
 *
 * A token nothing answers for renders as an empty string and logs: it can
 * only be a token a renderer forgot to pass, and an email that silently says
 * less than it should is the failure this catches. A token that is answered
 * with an empty value is ordinary -- somebody left the name field blank --
 * and says nothing.
 */
export function applyAutoReplyTokens(
  text: string,
  values: Record<string, string | null | undefined>,
  fallbackWhenTokensEmpty?: string,
): string {
  let tokens = 0;
  let resolved = 0;

  const substituted = text.replace(TOKEN_PATTERN, (_match, token: string) => {
    tokens += 1;
    if (!(token in values)) {
      console.warn(
        `[notifications] auto-reply copy uses {{${token}}}, which nothing resolves; rendering it empty`,
      );
      return "";
    }
    const value = values[token] ?? "";
    if (value !== "") resolved += 1;
    return value;
  });

  // Only a slot that held tokens and got nothing back falls through to the
  // fallback. A slot with no tokens at all had nothing to resolve, so "every
  // token resolved empty" is not true of it in any useful sense.
  if (tokens > 0 && resolved === 0 && fallbackWhenTokensEmpty !== undefined) {
    return fallbackWhenTokensEmpty;
  }
  return substituted;
}

/**
 * Every slot of one resolved reply, token-substituted, each with its own
 * fallback applied. What a renderer (#1234) actually wants.
 */
export function applyAutoReplyCopy(
  definition: AutoReplyDefinition,
  copy: AutoReplyCopy,
  values: Record<string, string | null | undefined>,
): AutoReplyCopy {
  const rendered = emptyAutoReplyCopy();
  for (const slot of definition.slots) {
    rendered[slot.key] = applyAutoReplyTokens(
      copy[slot.key],
      values,
      slot.fallbackWhenTokensEmpty,
    );
  }
  return rendered;
}
