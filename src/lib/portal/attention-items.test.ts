import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOpsInboxSummary } from "./attention-items";

type QueueRow = { status: string; claimed_by_person_id: string | null };

/**
 * Head counts over canned rows, honouring the two filters the inbox applies
 * (`eq` on status, `is` on the claimant) -- enough to prove the totals and the
 * unclaimed counts come from the same queue.
 */
function countingClient(
  tables: Record<string, QueueRow[]>,
  rpc: Record<string, number> = {},
): SupabaseClient {
  return {
    from(table: string) {
      let rows = tables[table] ?? [];
      const chain = {
        select: () => chain,
        eq(column: keyof QueueRow, value: string) {
          rows = rows.filter((row) => row[column] === value);
          return chain;
        },
        is(column: keyof QueueRow, value: null) {
          rows = rows.filter((row) => row[column] === value);
          return chain;
        },
        then(resolve: (value: { count: number }) => unknown) {
          return Promise.resolve({ count: rows.length }).then(resolve);
        },
      };
      return chain;
    },
    rpc: (name: string) => Promise.resolve({ data: rpc[name] ?? 0 }),
  } as unknown as SupabaseClient;
}

const NO_QUEUES = {
  canSeeVolunteerApplications: false,
  canSeeContactMessages: false,
  canSeeEventCheckins: false,
  canSeeArtworkSubmissions: false,
  canSeeGearRequests: false,
  canSeePersonClaims: false,
  canSeeVolunteerHourSubmissions: false,
};

describe("getOpsInboxSummary unclaimed counts (#1668)", () => {
  test("says how many are unclaimed and links to them when some are claimed", async () => {
    const supabase = countingClient({
      gear_requests: [
        { status: "new", claimed_by_person_id: null },
        { status: "new", claimed_by_person_id: null },
        { status: "new", claimed_by_person_id: "p1" },
        { status: "quoted", claimed_by_person_id: null },
      ],
    });
    const { items } = await getOpsInboxSummary(supabase, {
      ...NO_QUEUES,
      canSeeGearRequests: true,
    });
    expect(items).toEqual([
      {
        key: "gear_requests_new",
        label: "New item requests (2 unclaimed)",
        count: 3,
        href: "/portal/inventory/requests?status=new&claimed=none",
        severity: "info",
      },
    ]);
  });

  test("leaves the label and link plain when nothing is claimed", async () => {
    const supabase = countingClient({
      contact_messages: [
        { status: "new", claimed_by_person_id: null },
        { status: "new", claimed_by_person_id: null },
      ],
    });
    const { items } = await getOpsInboxSummary(supabase, {
      ...NO_QUEUES,
      canSeeContactMessages: true,
    });
    expect(items[0].label).toBe("New messages");
    expect(items[0].href).toBe("/portal/communications?status=new");
  });

  test("still counts a queue whose every item is claimed", async () => {
    const supabase = countingClient({
      person_claims: [{ status: "pending", claimed_by_person_id: "p1" }],
    });
    const { items } = await getOpsInboxSummary(supabase, {
      ...NO_QUEUES,
      canSeePersonClaims: true,
    });
    expect(items[0].label).toBe("Account claims (0 unclaimed)");
    expect(items[0].href).toBe("/portal/people/claims?claimed=none");
  });

  test("artwork reads both counts from its RPCs", async () => {
    const supabase = countingClient(
      {},
      {
        count_pending_artwork_submissions: 4,
        count_unclaimed_pending_artwork_submissions: 1,
      },
    );
    const { items } = await getOpsInboxSummary(supabase, {
      ...NO_QUEUES,
      canSeeArtworkSubmissions: true,
    });
    expect(items[0].label).toBe("Artwork to review (1 unclaimed)");
    expect(items[0].count).toBe(4);
    expect(items[0].href).toBe("/portal/artwork?status=pending&claimed=none");
  });
});
