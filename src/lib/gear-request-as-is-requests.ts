/**
 * Asking a gear request's requester to acknowledge the as-is terms by emailed
 * link (#1518): which requests can be asked, what the Requests list and the
 * request detail say about it, and the words the email goes out in.
 *
 * #1367 took the acknowledgement on the public request and invented nothing
 * for the requests written before it. A staff checkbox would be staff
 * attesting on the requester's behalf, so the requester acts, on the shared
 * `/acknowledge` page (#1519), through a link that is theirs alone -- #1502's
 * shape for registration answers.
 *
 * No runtime imports beyond siblings of the same kind: the dialog that counts
 * the recipients is a client component and the action that resolves them for
 * real is on the server, and both have to agree.
 */

import { MAX_ANSWER_REQUEST_RECIPIENTS } from "@/lib/registration-answer-requests";
import { GEAR_AS_IS_REQUEST_KIND } from "@/lib/outbound-messages";

/** The most requesters one bulk send reaches, for #1502's reason. */
export const MAX_AS_IS_REQUEST_RECIPIENTS = MAX_ANSWER_REQUEST_RECIPIENTS;

/** How long a request counts as recently asked: the bulk send skips it. */
export const RECENTLY_ASKED_AS_IS_MS = 24 * 60 * 60 * 1000;

/** How long a link works. Mirrors the interval in
 *  `request_gear_request_acknowledgements()`. */
export const AS_IS_LINK_DAYS = 30;

/** The part of a request's link the portal reads. */
export type AsIsRequestStatus = {
  requested_at: string;
  acknowledged_at: string | null;
};

/** The part of a request that decides whether it can be asked. */
export type AsIsRequestCandidate = {
  id: string;
  status: string;
  as_is_acknowledged_at: string | null;
  requester: {
    name: string | null;
    preferred_name: string | null;
    email: string | null;
  } | null;
  person_id?: string | null;
  as_is_request: AsIsRequestStatus | null;
};

/** A request's link as PostgREST embeds it: a one-to-one embed arrives as an
 *  object or a one-row array depending on what it can prove. */
export function oneAsIsRequest(
  value: AsIsRequestStatus | AsIsRequestStatus[] | null | undefined,
): AsIsRequestStatus | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/** Not acknowledged, and not cancelled: the requests a link can be sent for. */
export function needsAsIsAcknowledgement(request: {
  status: string;
  as_is_acknowledged_at: string | null;
}): boolean {
  return request.status !== "cancelled" && !request.as_is_acknowledged_at;
}

/** What the list and the detail say beside the status, or null for nothing:
 *  an ordinary request acknowledged on the form needs no badge. */
export type AsIsBadgeState =
  | { state: "acknowledged"; at: string }
  | { state: "requested"; at: string }
  | { state: "missing" };

export function asIsBadgeState(request: {
  status: string;
  as_is_acknowledged_at: string | null;
  as_is_method: string | null;
  as_is_request: AsIsRequestStatus | null;
}): AsIsBadgeState | null {
  if (request.as_is_acknowledged_at) {
    return request.as_is_method === "emailed_link"
      ? { state: "acknowledged", at: request.as_is_acknowledged_at }
      : null;
  }
  if (request.status === "cancelled") return null;
  if (request.as_is_request) {
    return { state: "requested", at: request.as_is_request.requested_at };
  }
  return { state: "missing" };
}

export function wasAskedRecently(
  request: AsIsRequestStatus | null,
  now: number = Date.now(),
): boolean {
  if (!request) return false;
  return now - Date.parse(request.requested_at) < RECENTLY_ASKED_AS_IS_MS;
}

export type AsIsRequestRecipient = {
  requestId: string;
  name: string;
  email: string;
  personId: string | null;
};

export type ResolvedAsIsRequests = {
  recipients: AsIsRequestRecipient[];
  overCap: number;
  withoutAddress: number;
  recentlyAsked: number;
};

/**
 * Who a bulk send reaches: every request not cancelled and not acknowledged,
 * with an address, not asked in the last day unless `includeRecent`, up to
 * the cap. A repeated address is not collapsed: each link records one
 * request.
 */
export function resolveAsIsRequests(
  requests: readonly AsIsRequestCandidate[],
  options: { includeRecent: boolean; now?: number },
): ResolvedAsIsRequests {
  const now = options.now ?? Date.now();
  const resolved: ResolvedAsIsRequests = {
    recipients: [],
    overCap: 0,
    withoutAddress: 0,
    recentlyAsked: 0,
  };

  for (const request of requests) {
    if (!needsAsIsAcknowledgement(request)) continue;
    const email = (request.requester?.email ?? "").trim();
    if (!email) {
      resolved.withoutAddress += 1;
      continue;
    }
    if (
      !options.includeRecent &&
      wasAskedRecently(request.as_is_request, now)
    ) {
      resolved.recentlyAsked += 1;
      continue;
    }
    if (resolved.recipients.length >= MAX_AS_IS_REQUEST_RECIPIENTS) {
      resolved.overCap += 1;
      continue;
    }
    resolved.recipients.push({
      requestId: request.id,
      name: (
        request.requester?.preferred_name?.trim() ||
        request.requester?.name?.trim() ||
        ""
      ).trim(),
      email,
      personId: request.person_id ?? null,
    });
  }

  return resolved;
}

/** The sentence the dialog shows before the send. */
export function describeAsIsRequests(resolved: ResolvedAsIsRequests): string {
  const count = resolved.recipients.length;
  const head =
    count === 0
      ? "This will email nobody"
      : `This will email ${count} ${count === 1 ? "requester" : "requesters"} whose request has no as-is acknowledgement`;

  const notes: string[] = [];
  if (resolved.overCap > 0) {
    notes.push(
      `${resolved.overCap} more can be asked tomorrow — ${MAX_AS_IS_REQUEST_RECIPIENTS} is the most one send reaches`,
    );
  }
  if (resolved.recentlyAsked > 0) {
    notes.push(
      `${resolved.recentlyAsked} ${resolved.recentlyAsked === 1 ? "was" : "were"} asked in the last 24 hours`,
    );
  }
  if (resolved.withoutAddress > 0) {
    notes.push(
      `${resolved.withoutAddress} ${resolved.withoutAddress === 1 ? "has" : "have"} no email address`,
    );
  }

  return notes.length > 0 ? `${head}; ${notes.join("; ")}.` : `${head}.`;
}

/** Per request and per send, so the delivery log finds it from the record. */
export function gearAsIsRequestDedupeKey(
  requestId: string,
  batchId: string,
): string {
  return `${GEAR_AS_IS_REQUEST_KIND}:${requestId}:${batchId}`;
}

export function asIsRequestSubject(collectionLabel: string): string {
  const label = collectionLabel.trim();
  return label
    ? `About your ${label.toLowerCase()} request: one thing to confirm`
    : "About your request: one thing to confirm";
}

export const AS_IS_REQUEST_ERRORS = {
  NOT_FOUND: "This request could not be found.",
  CANCELLED: "This request is cancelled, so there is nothing to acknowledge.",
  ALREADY_ACKNOWLEDGED:
    "This request's as-is acknowledgement is already recorded.",
  NO_EMAIL:
    "This request has no email address to write to — the requester's record was cleared or never carried one.",
  NO_RECIPIENTS:
    "No request missing its acknowledgement has an address to write to, so there is nothing to send.",
  FAILED: "The request could not be sent. Please try again.",
} as const;
