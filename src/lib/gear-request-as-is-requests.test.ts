import { describe, expect, test } from "bun:test";
import {
  MAX_AS_IS_REQUEST_RECIPIENTS,
  asIsBadgeState,
  asIsRequestSubject,
  describeAsIsRequests,
  gearAsIsRequestDedupeKey,
  oneAsIsRequest,
  resolveAsIsRequests,
  type AsIsRequestCandidate,
} from "./gear-request-as-is-requests";

const NOW = Date.parse("2026-10-05T12:00:00Z");
const HOURS = 60 * 60 * 1000;

function candidate(
  overrides: Partial<AsIsRequestCandidate> = {},
): AsIsRequestCandidate {
  return {
    id: crypto.randomUUID(),
    status: "new",
    as_is_acknowledged_at: null,
    person_id: "p1",
    requester: {
      name: "Robin Example",
      preferred_name: null,
      email: "r@x.test",
    },
    as_is_request: null,
    ...overrides,
  };
}

describe("resolveAsIsRequests", () => {
  test("asks every open or fulfilled request missing its acknowledgement", () => {
    const resolved = resolveAsIsRequests(
      [
        candidate({ status: "fulfilled" }),
        candidate({ status: "cancelled" }),
        candidate({ as_is_acknowledged_at: "2026-09-30T00:00:00Z" }),
      ],
      { includeRecent: false, now: NOW },
    );
    expect(resolved.recipients).toHaveLength(1);
  });

  test("counts the ones without an address and the recently asked", () => {
    const resolved = resolveAsIsRequests(
      [
        candidate({ requester: null }),
        candidate({
          as_is_request: {
            requested_at: new Date(NOW - 2 * HOURS).toISOString(),
            acknowledged_at: null,
          },
        }),
      ],
      { includeRecent: false, now: NOW },
    );
    expect(resolved).toMatchObject({ withoutAddress: 1, recentlyAsked: 1 });
    expect(resolved.recipients).toHaveLength(0);

    const again = resolveAsIsRequests(
      [
        candidate({
          as_is_request: {
            requested_at: new Date(NOW - 2 * HOURS).toISOString(),
            acknowledged_at: null,
          },
        }),
      ],
      { includeRecent: true, now: NOW },
    );
    expect(again.recipients).toHaveLength(1);
  });

  test("caps one send, and prefers the preferred name", () => {
    const many = Array.from({ length: MAX_AS_IS_REQUEST_RECIPIENTS + 2 }, () =>
      candidate({
        requester: {
          name: "Robin Example",
          preferred_name: "Rob",
          email: "r@x.test",
        },
      }),
    );
    const resolved = resolveAsIsRequests(many, {
      includeRecent: false,
      now: NOW,
    });
    expect(resolved.recipients).toHaveLength(MAX_AS_IS_REQUEST_RECIPIENTS);
    expect(resolved.overCap).toBe(2);
    expect(resolved.recipients[0].name).toBe("Rob");
    expect(describeAsIsRequests(resolved)).toContain(
      "2 more can be asked tomorrow",
    );
  });
});

describe("asIsBadgeState", () => {
  const base = {
    status: "new",
    as_is_acknowledged_at: null,
    as_is_method: null,
    as_is_request: null,
  };

  test("nothing for an ordinary acknowledgement or a cancelled request", () => {
    expect(
      asIsBadgeState({
        ...base,
        as_is_acknowledged_at: "2026-10-01T00:00:00Z",
        as_is_method: "request_form",
      }),
    ).toBeNull();
    expect(asIsBadgeState({ ...base, status: "cancelled" })).toBeNull();
  });

  test("missing, requested, then acknowledged", () => {
    expect(asIsBadgeState(base)).toEqual({ state: "missing" });
    expect(
      asIsBadgeState({
        ...base,
        as_is_request: {
          requested_at: "2026-10-02T00:00:00Z",
          acknowledged_at: null,
        },
      }),
    ).toEqual({ state: "requested", at: "2026-10-02T00:00:00Z" });
    expect(
      asIsBadgeState({
        ...base,
        as_is_acknowledged_at: "2026-10-03T00:00:00Z",
        as_is_method: "emailed_link",
      }),
    ).toEqual({ state: "acknowledged", at: "2026-10-03T00:00:00Z" });
  });
});

test("an embedded link arrives as an object or a one-row array", () => {
  const link = { requested_at: "2026-10-02T00:00:00Z", acknowledged_at: null };
  expect(oneAsIsRequest([link])).toBe(link);
  expect(oneAsIsRequest(link)).toBe(link);
  expect(oneAsIsRequest([])).toBeNull();
  expect(oneAsIsRequest(null)).toBeNull();
});

test("the dedupe key and the subject", () => {
  expect(gearAsIsRequestDedupeKey("r1", "b1")).toBe("gear_as_is_request:r1:b1");
  expect(asIsRequestSubject("Gear Library")).toBe(
    "About your gear library request: one thing to confirm",
  );
});
