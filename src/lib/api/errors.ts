import "server-only";

/**
 * One error shape for the whole public API (#813 Phase 3).
 *
 * `{ error: { code, message, fields? } }`. The `code` is what a consumer
 * branches on and is part of the contract; the `message` is a sentence for a
 * developer reading a log, not copy for an end user -- a consumer renders its
 * own words, in its own language, from the code.
 */
export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Per-field messages, for a 422 from a form post. */
    fields?: Record<string, string>;
  };
};

export type ApiErrorCode =
  /** The tenant, or the thing asked for inside it, is not there. */
  | "not_found"
  /** The body or the query string did not parse. */
  | "invalid_request"
  /** `check_rate_limit()` said no. */
  | "rate_limited"
  /** A browser origin this tenant has not allow-listed tried to post. */
  | "origin_not_allowed"
  /** The write conflicts with the state of the thing (full, closed, taken). */
  | "conflict"
  /** Something broke on this side. */
  | "server_error";

const STATUS: Record<ApiErrorCode, number> = {
  not_found: 404,
  invalid_request: 422,
  rate_limited: 429,
  origin_not_allowed: 403,
  conflict: 409,
  server_error: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;
  readonly retryAfterSeconds?: number;

  constructor(
    code: ApiErrorCode,
    message: string,
    options: {
      fields?: Record<string, string>;
      retryAfterSeconds?: number;
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS[code];
    this.fields = options.fields;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  get body(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
      },
    };
  }
}

/**
 * The window `check_rate_limit()` counts over
 * (`20260826170000_create_rate_limit_check.sql`), in seconds. Sent as
 * `Retry-After` on a 429 -- the honest upper bound, since the limiter counts
 * hits in a sliding window rather than blocking until a fixed moment.
 */
export const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

/**
 * What a `raise exception` from an intake RPC becomes over HTTP.
 *
 * The RPCs answer in short uppercase codes, and those codes are already the
 * contract the server actions translate for the website's forms
 * (`ERROR_MESSAGES` in each actions file). This is the same translation for a
 * different audience: a status and a stable lowercase code instead of a
 * sentence in English.
 *
 * **A disabled module is a 404, everywhere.** #902 made the intake RPCs refuse
 * when the module that owns them is off, and it deliberately reused each RPC's
 * existing "no such thing" answer to do it -- `EVENT_NOT_FOUND` for events,
 * `ITEM_NOT_FOUND` for inventory -- with `SECTION_UNAVAILABLE` added only
 * where there was no such answer to reuse. Mapping all of them to 404 keeps
 * that: which modules an organization has bought is not something its public
 * API should be willing to tell a stranger, and "this tenant does not have
 * this" is the truthful answer either way.
 */
const RPC_ERRORS: Record<
  string,
  { code: ApiErrorCode; message: string; field?: string }
> = {
  RATE_LIMITED: {
    code: "rate_limited",
    message: "Too many requests from this address; try again shortly.",
  },

  // Module gating (#902), and genuine misses. Both 404: see above.
  SECTION_UNAVAILABLE: {
    code: "not_found",
    message: "This organization does not offer this.",
  },
  EVENT_NOT_FOUND: { code: "not_found", message: "No such published event." },
  ITEM_NOT_FOUND: { code: "not_found", message: "No such available item." },
  CALL_CLOSED: {
    code: "not_found",
    message: "This call for artwork is closed.",
  },
  RIDER_PROFILE_UNAVAILABLE: {
    code: "not_found",
    message: "No recent registration to attach a rider profile to.",
  },

  // State of the thing, not of the request.
  REGISTRATION_CLOSED: {
    code: "conflict",
    message: "Registration is closed for this event.",
  },
  REGISTRATION_DEADLINE_PASSED: {
    code: "conflict",
    message: "The registration deadline for this event has passed.",
  },
  EVENT_AT_CAPACITY: { code: "conflict", message: "This event is full." },
  ALREADY_REGISTERED: {
    code: "conflict",
    message: "This email is already registered for this event.",
  },
  ALREADY_SUBMITTED: {
    code: "conflict",
    message: "An application from this email was submitted in the last day.",
  },
  ITEM_ALREADY_REQUESTED: {
    code: "conflict",
    message: "One of these items has already been requested.",
  },

  // Field-level refusals the database makes even though the handler's schema
  // passed -- a length or a shape only Postgres knows about.
  NAME_REQUIRED: {
    code: "invalid_request",
    message: "A name is required.",
    field: "name",
  },
  INVALID_EMAIL: {
    code: "invalid_request",
    message: "A valid email address is required.",
    field: "email",
  },
  TOPIC_REQUIRED: {
    code: "invalid_request",
    message: "A topic is required.",
    field: "topic",
  },
  MESSAGE_REQUIRED: {
    code: "invalid_request",
    message: "A message is required.",
    field: "message",
  },
  PRONOUNS_TOO_LONG: {
    code: "invalid_request",
    message: "Pronouns must be 40 characters or fewer.",
    field: "pronouns",
  },
  INVALID_PARTY_SIZE: {
    code: "invalid_request",
    message: "Party size must be at least 1.",
    field: "party_size",
  },
  MINOR_CONTACTS_REQUIRED: {
    code: "invalid_request",
    message:
      "A party that includes anyone under 18 needs an accompanying adult and an emergency contact.",
    field: "accompanying_adult_name",
  },
  INVALID_RIDER_PROFILE: {
    code: "invalid_request",
    message: "The riding discipline and experience levels do not agree.",
  },
  NO_ITEMS: {
    code: "invalid_request",
    message: "Name at least one item.",
    field: "item_ids",
  },
  // Unreachable through the handler, whose schema will not parse a body
  // without it (#1367). Mapped anyway, because the alternative for a refusal
  // this endpoint can make is a 500 that says "something went wrong on our
  // side" about something that went wrong on the caller's.
  AS_IS_REQUIRED: {
    code: "invalid_request",
    message:
      "The requester must be shown, and acknowledge, that these items are given as-is.",
    field: "as_is_acknowledged",
  },
};

/** Turns a PostgREST error into the `ApiError` the envelope is built from. */
export function apiErrorFromRpc(error: { message?: string } | null): ApiError {
  const raw = error?.message?.trim() ?? "";
  const known = RPC_ERRORS[raw];

  if (!known) {
    // Anything unrecognised is ours, not the caller's: a constraint violation,
    // a missing grant, a typo in a new RPC. The caller gets a 500 and no
    // detail; the detail goes to the log.
    console.error("[api] unmapped database error", error);
    return new ApiError("server_error", "Something went wrong on our side.");
  }

  return new ApiError(known.code, known.message, {
    fields: known.field ? { [known.field]: known.message } : undefined,
    retryAfterSeconds:
      known.code === "rate_limited" ? RATE_LIMIT_WINDOW_SECONDS : undefined,
  });
}
