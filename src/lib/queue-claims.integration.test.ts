// Queue claims (#1668) against a real local stack: set_queue_item_claim() on
// all six queue tables, and the clear written into every resolution path.
//
// Per queue: claim / unclaim / assign succeed with the queue's manage; are
// refused with view only (the board role, granted view for the run) and
// across tenants (another tenant's item, another tenant's assignee); a claim
// is refused on a resolved item while releasing one is not; and each path
// that resolves an item clears its claim while the states that only move it
// along keep it.
//
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createPerson,
  enableModule,
  seededTenantId,
  serviceRoleClient,
  signIn,
  signInAs,
  uniqueEmail,
} from "../../test/integration-setup";
import type { QueueKey } from "./queue-claims";

mock.module("next/cache", () => ({ revalidatePath: mock(() => {}) }));
let currentSupabase: SupabaseClient = adminClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { setQueueItemClaimAction } =
  await import("@/app/portal/(app)/queue-claim-actions");
const { updateVolunteerApplicationStatusAction } =
  await import("@/app/portal/(app)/volunteers/applications/actions");
const { updateContactMessageStatusAction } =
  await import("@/app/portal/(app)/communications/actions");
const { updateArtworkSubmissionStatusAction } =
  await import("@/app/portal/(app)/artwork/actions");

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);
const RESOURCES = [
  "inventory",
  "constituent_claims",
  "volunteers",
  "communications",
  "artwork_submissions",
];

let tenantId: string;
let otherTenantId: string;
let otherPersonId: string;
let adminPersonId: string;
let staffPersonId: string;
let artworkCallId: string;
let otherArtworkCallId: string;
let boardRoleId: string;
let restoreBoard: { resource_id: string; level: string }[] = [];
let restoreModule: () => Promise<void>;
const cleanups: (() => PromiseLike<unknown>)[] = [];
const createdUsers: string[] = [];

type Table =
  | "gear_requests"
  | "person_claims"
  | "volunteer_hour_submissions"
  | "volunteer_applications"
  | "contact_messages"
  | "artwork_submissions";

const TABLES: Record<QueueKey, Table> = {
  gear_requests: "gear_requests",
  person_claims: "person_claims",
  volunteer_hours: "volunteer_hour_submissions",
  volunteer_applications: "volunteer_applications",
  contact_messages: "contact_messages",
  artwork_submissions: "artwork_submissions",
};

async function insert(table: string, row: Record<string, unknown>) {
  const { data, error } = await service
    .from(table)
    .insert(row)
    .select("id")
    .single();
  if (error) throw new Error(`${table}: ${error.message}`);
  const id = data.id as string;
  cleanups.push(() => service.from(table).delete().eq("id", id));
  return id;
}

async function bareUser(): Promise<{ id: string; email: string }> {
  const email = uniqueEmail(`queue-claim-${run}`);
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });
  if (error) throw error;
  createdUsers.push(data.user!.id);
  return { id: data.user!.id, email };
}

async function personIn(tenant: string): Promise<string> {
  return insert("people", {
    tenant_id: tenant,
    name: `Queue claim person ${run}`,
    source_type: "other",
  });
}

/** One waiting item in each queue, in the given tenant. */
const CREATE: Record<QueueKey, (tenant: string) => Promise<string>> = {
  gear_requests: (tenant) =>
    insert("gear_requests", { tenant_id: tenant, delivery_method: "meetup" }),
  person_claims: async (tenant) =>
    insert("person_claims", {
      tenant_id: tenant,
      auth_user_id: (await bareUser()).id,
      stated_name: "Queue Claimant",
    }),
  volunteer_hours: async (tenant) =>
    insert("volunteer_hour_submissions", {
      tenant_id: tenant,
      person_id: await personIn(tenant),
      hours: 2,
      logged_date: "2026-10-01",
    }),
  volunteer_applications: async (tenant) =>
    insert("volunteer_applications", {
      tenant_id: tenant,
      person_id: await personIn(tenant),
      name: "Queue Applicant",
      email: uniqueEmail(`queue-app-${run}`),
      reference_code: `QC${crypto.randomUUID().slice(0, 8)}`,
    }),
  contact_messages: (tenant) =>
    insert("contact_messages", {
      tenant_id: tenant,
      name: "Queue Sender",
      email: uniqueEmail(`queue-msg-${run}`),
      topic: "general",
      message: "Hello",
    }),
  artwork_submissions: (tenant) =>
    insert("artwork_submissions", {
      tenant_id: tenant,
      call_id: tenant === tenantId ? artworkCallId : otherArtworkCallId,
      submitter_name: "Queue Artist",
      submitter_email: uniqueEmail(`queue-art-${run}`),
    }),
};

/** Puts an item straight into a resolved state, bypassing its own path. */
const RESOLVE_DIRECTLY: Record<QueueKey, Record<string, unknown>> = {
  gear_requests: {
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
  },
  person_claims: { status: "withdrawn" },
  volunteer_hours: {
    status: "declined",
    reviewed_at: new Date().toISOString(),
  },
  volunteer_applications: { status: "closed" },
  contact_messages: { status: "resolved" },
  artwork_submissions: { status: "approved" },
};

async function claimOf(queue: QueueKey, id: string) {
  const { data, error } = await service
    .from(TABLES[queue])
    .select("status, claimed_by_person_id, claimed_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as {
    status: string;
    claimed_by_person_id: string | null;
    claimed_at: string | null;
  };
}

function setClaim(
  client: SupabaseClient,
  queue: QueueKey,
  id: string,
  personId: string | null,
) {
  return client.rpc("set_queue_item_claim", {
    p_queue: queue,
    p_id: id,
    p_person_id: personId,
  });
}

beforeAll(async () => {
  tenantId = await seededTenantId();
  restoreModule = await enableModule(tenantId, "constituent_accounts");

  adminPersonId = (await adminClient.rpc("my_person_id")).data as string;
  if (!adminPersonId) throw new Error("the seeded admin has no person row");
  const staff = await createPerson({ name: `Queue staff ${run}` });
  staffPersonId = staff.id;
  cleanups.push(staff.cleanup);

  // Suspended, so the sole-active-tenant default the suite relies on holds.
  const { data: tenant, error } = await service
    .from("tenants")
    .insert({
      name: `Queue Claims Isolation ${run}`,
      slug: `queue-claims-isolation-${run}`,
      status: "suspended",
    })
    .select("id")
    .single();
  if (error) throw error;
  otherTenantId = tenant.id as string;
  otherPersonId = await personIn(otherTenantId);

  artworkCallId = await insert("event_artwork_calls", {
    tenant_id: tenantId,
    title: `Queue claims call ${run}`,
  });
  otherArtworkCallId = await insert("event_artwork_calls", {
    tenant_id: otherTenantId,
    title: `Queue claims call ${run}`,
  });

  // The board role holds none of these resources in the seed; give it view
  // for the run, so "view only" is a real grant rather than an absent one.
  const { data: board } = await service
    .from("roles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", "board")
    .single();
  boardRoleId = board!.id as string;
  const { data: resources } = await service
    .from("resources")
    .select("id, key")
    .in("key", RESOURCES);
  const ids = (resources ?? []).map((resource) => resource.id as string);
  const { data: existing } = await service
    .from("role_permissions")
    .select("resource_id, level")
    .eq("role_id", boardRoleId)
    .in("resource_id", ids);
  restoreBoard = (existing ?? []) as { resource_id: string; level: string }[];
  const grant = await service.from("role_permissions").upsert(
    ids.map((resource_id) => ({
      tenant_id: tenantId,
      role_id: boardRoleId,
      resource_id,
      level: "view",
    })),
    { onConflict: "role_id,resource_id" },
  );
  if (grant.error) throw grant.error;
});

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  const { data: resources } = await service
    .from("resources")
    .select("id")
    .in("key", RESOURCES);
  const touched = (resources ?? []).map((resource) => resource.id as string);
  const kept = new Set(restoreBoard.map((row) => row.resource_id));
  await service
    .from("role_permissions")
    .delete()
    .eq("role_id", boardRoleId)
    .in(
      "resource_id",
      touched.filter((id) => !kept.has(id)),
    );
  for (const row of restoreBoard) {
    await service
      .from("role_permissions")
      .update({ level: row.level })
      .eq("role_id", boardRoleId)
      .eq("resource_id", row.resource_id);
  }
  await service.from("person_claims").delete().in("auth_user_id", createdUsers);
  await service.from("people").delete().in("auth_user_id", createdUsers);
  await service
    .from("retention_policies")
    .delete()
    .eq("tenant_id", otherTenantId);
  await service.from("tenants").delete().eq("id", otherTenantId);
  await restoreModule();
});

const QUEUES = Object.keys(TABLES) as QueueKey[];

describe.each(QUEUES)("set_queue_item_claim on %s", (queue) => {
  test("manage can claim, unclaim and assign", async () => {
    const id = await CREATE[queue](tenantId);

    expect(
      (await setClaim(adminClient, queue, id, adminPersonId)).error,
    ).toBeNull();
    const claimed = await claimOf(queue, id);
    expect(claimed.claimed_by_person_id).toBe(adminPersonId);
    expect(claimed.claimed_at).not.toBeNull();

    // Claiming again for the same person keeps the original time.
    await setClaim(adminClient, queue, id, adminPersonId);
    expect((await claimOf(queue, id)).claimed_at).toBe(claimed.claimed_at);

    expect(
      (await setClaim(adminClient, queue, id, staffPersonId)).error,
    ).toBeNull();
    expect((await claimOf(queue, id)).claimed_by_person_id).toBe(staffPersonId);

    expect((await setClaim(adminClient, queue, id, null)).error).toBeNull();
    expect(await claimOf(queue, id)).toMatchObject({
      claimed_by_person_id: null,
      claimed_at: null,
    });
  });

  test("view only is refused claiming, assigning and releasing", async () => {
    const id = await CREATE[queue](tenantId);
    const board = await signInAs(SEEDED_USERS.board);
    const boardPersonId = (await board.rpc("my_person_id")).data as string;
    expect(boardPersonId).toBeTruthy();

    for (const person of [boardPersonId, staffPersonId]) {
      const { error } = await setClaim(board, queue, id, person);
      expect(error?.message).toBe("PERMISSION_DENIED");
    }
    await setClaim(adminClient, queue, id, staffPersonId);
    const { error } = await setClaim(board, queue, id, null);
    expect(error?.message).toBe("PERMISSION_DENIED");
    expect((await claimOf(queue, id)).claimed_by_person_id).toBe(staffPersonId);
  });

  test("is refused across tenants, for the item and for the assignee", async () => {
    const theirs = await CREATE[queue](otherTenantId);
    const { error: itemError } = await setClaim(
      adminClient,
      queue,
      theirs,
      adminPersonId,
    );
    expect(itemError?.message).toBe("ITEM_NOT_FOUND");
    expect((await claimOf(queue, theirs)).claimed_by_person_id).toBeNull();

    const ours = await CREATE[queue](tenantId);
    const { error: personError } = await setClaim(
      adminClient,
      queue,
      ours,
      otherPersonId,
    );
    expect(personError?.message).toBe("PERSON_NOT_FOUND");
    expect((await claimOf(queue, ours)).claimed_by_person_id).toBeNull();
  });

  test("a resolved item refuses a claim but can still be released", async () => {
    const id = await CREATE[queue](tenantId);
    await setClaim(adminClient, queue, id, staffPersonId);
    const reviewer = (await adminClient.auth.getUser()).data.user!.id;
    const resolved = { ...RESOLVE_DIRECTLY[queue] };
    if ("reviewed_at" in resolved) resolved.reviewed_by = reviewer;
    const { error: resolveError } = await service
      .from(TABLES[queue])
      .update(resolved)
      .eq("id", id);
    if (resolveError) throw resolveError;

    const { error } = await setClaim(adminClient, queue, id, adminPersonId);
    expect(error?.message).toBe("ITEM_RESOLVED");
    expect((await setClaim(adminClient, queue, id, null)).error).toBeNull();
    expect((await claimOf(queue, id)).claimed_by_person_id).toBeNull();
  });
});

/** Claims a fresh item, runs one path on it, and returns the claim after. */
async function afterPath(
  queue: QueueKey,
  path: (id: string) => Promise<object | void | null>,
) {
  const id = await CREATE[queue](tenantId);
  await setClaim(adminClient, queue, id, staffPersonId);
  currentSupabase = adminClient;
  const result = await path(id);
  if (result && "error" in result && result.error) {
    throw new Error(`path failed: ${JSON.stringify(result.error)}`);
  }
  return { id, ...(await claimOf(queue, id)) };
}

function rpc(name: string, args: Record<string, unknown>) {
  return async () => {
    const { error } = await adminClient.rpc(name, args);
    return { error };
  };
}

describe("resolution clears the claim; intermediate states keep it", () => {
  test("item requests: quoted and paid keep it, fulfilled and cancelled clear it", async () => {
    const shipping = await insert("gear_requests", {
      tenant_id: tenantId,
      delivery_method: "shipping",
    });
    await setClaim(adminClient, "gear_requests", shipping, staffPersonId);
    await rpc("set_gear_request_status", {
      p_request_id: shipping,
      p_status: "quoted",
      p_quoted_amount: 5,
    })();
    await rpc("set_gear_request_status", {
      p_request_id: shipping,
      p_status: "paid",
    })();
    expect(await claimOf("gear_requests", shipping)).toMatchObject({
      status: "paid",
      claimed_by_person_id: staffPersonId,
    });

    for (const status of ["fulfilled", "cancelled"]) {
      const after = await afterPath("gear_requests", (id) =>
        rpc("set_gear_request_status", {
          p_request_id: id,
          p_status: status,
        })(),
      );
      expect(after).toMatchObject({ status, claimed_by_person_id: null });
    }
  });

  test("account claims: approved and rejected clear it", async () => {
    for (const approve of [true, false]) {
      const after = await afterPath("person_claims", (id) =>
        rpc("review_person_claim", { p_claim_id: id, p_approve: approve })(),
      );
      expect(after).toMatchObject({
        status: approve ? "approved" : "rejected",
        claimed_by_person_id: null,
        claimed_at: null,
      });
    }
  });

  test("account claims: the claimant's withdraw clears it, and must", async () => {
    const user = await bareUser();
    const id = await insert("person_claims", {
      tenant_id: tenantId,
      auth_user_id: user.id,
      stated_name: "Withdrawing Claimant",
    });
    await setClaim(adminClient, "person_claims", id, staffPersonId);
    const claimant = await signIn(user.email);

    // Withdrawing without clearing the staff claim is refused by the policy...
    const kept = await claimant
      .from("person_claims")
      .update({ status: "withdrawn" })
      .eq("id", id)
      .select("id");
    expect(kept.error ?? kept.data?.length === 0).toBeTruthy();
    expect((await claimOf("person_claims", id)).status).toBe("pending");

    // ...and writing a claim onto your own row on the way out is too.
    const forged = await claimant
      .from("person_claims")
      .update({
        status: "withdrawn",
        claimed_by_person_id: adminPersonId,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id");
    expect(forged.error ?? forged.data?.length === 0).toBeTruthy();

    const withdrawn = await claimant
      .from("person_claims")
      .update({
        status: "withdrawn",
        claimed_by_person_id: null,
        claimed_at: null,
      })
      .eq("id", id)
      .select("id");
    expect(withdrawn.error).toBeNull();
    expect(await claimOf("person_claims", id)).toMatchObject({
      status: "withdrawn",
      claimed_by_person_id: null,
    });
  });

  test("self-logged hours: confirmed and declined clear it", async () => {
    for (const confirm of [true, false]) {
      const after = await afterPath("volunteer_hours", (id) =>
        rpc("review_volunteer_hour_submission", {
          p_submission_id: id,
          p_confirm: confirm,
        })(),
      );
      expect(after).toMatchObject({
        status: confirm ? "confirmed" : "declined",
        claimed_by_person_id: null,
      });
      if (confirm) {
        // The ledger row confirming wrote. The submission points at it and it
        // points at the person, so both go before the person does.
        const { data } = await service
          .from("volunteer_hour_submissions")
          .select("volunteer_hours_id")
          .eq("id", after.id)
          .single();
        const hoursId = data!.volunteer_hours_id as string;
        cleanups.push(async () => {
          await service
            .from("volunteer_hour_submissions")
            .delete()
            .eq("id", after.id);
          await service.from("volunteer_hours").delete().eq("id", hoursId);
        });
      }
    }
  });

  test("volunteer applications: being reviewed and contacted keep it; placed, declined and closed clear it", async () => {
    for (const status of ["being reviewed", "contacted"] as const) {
      const after = await afterPath("volunteer_applications", (id) =>
        updateVolunteerApplicationStatusAction(id, status),
      );
      expect(after.claimed_by_person_id).toBe(staffPersonId);
    }
    for (const status of ["placed", "declined", "closed"] as const) {
      const after = await afterPath("volunteer_applications", (id) =>
        updateVolunteerApplicationStatusAction(id, status),
      );
      expect(after).toMatchObject({ status, claimed_by_person_id: null });
    }
  });

  test("messages: read keeps it, resolved clears it", async () => {
    const read = await afterPath("contact_messages", (id) =>
      updateContactMessageStatusAction(id, "read"),
    );
    expect(read.claimed_by_person_id).toBe(staffPersonId);
    const resolved = await afterPath("contact_messages", (id) =>
      updateContactMessageStatusAction(id, "resolved"),
    );
    expect(resolved).toMatchObject({
      status: "resolved",
      claimed_by_person_id: null,
    });
  });

  test("artwork: approved and rejected clear it", async () => {
    for (const status of ["approved", "rejected"] as const) {
      const after = await afterPath("artwork_submissions", (id) =>
        updateArtworkSubmissionStatusAction(id, status, null),
      );
      expect(after).toMatchObject({ status, claimed_by_person_id: null });
    }
  });
});

describe("setQueueItemClaimAction", () => {
  test("claims for the caller when asked for self", async () => {
    const id = await CREATE.gear_requests(tenantId);
    currentSupabase = adminClient;
    expect(
      await setQueueItemClaimAction({
        queue: "gear_requests",
        id,
        assignee: "self",
      }),
    ).toEqual({ success: true });
    expect((await claimOf("gear_requests", id)).claimed_by_person_id).toBe(
      adminPersonId,
    );
  });

  test("says why when the caller has no person record", async () => {
    const id = await CREATE.gear_requests(tenantId);
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);
    expect(
      await setQueueItemClaimAction({
        queue: "gear_requests",
        id,
        assignee: "self",
      }),
    ).toEqual({
      error: "You need a person record in this organization to claim items.",
    });
  });

  test("answers a refusal in a sentence", async () => {
    const id = await CREATE.contact_messages(tenantId);
    currentSupabase = await signInAs(SEEDED_USERS.board);
    expect(
      await setQueueItemClaimAction({
        queue: "contact_messages",
        id,
        assignee: staffPersonId,
      }),
    ).toEqual({
      error: "You don't have permission to claim or assign this item.",
    });
  });
});

test("deleting the claimant clears the claim and keeps the item", async () => {
  const id = await CREATE.contact_messages(tenantId);
  const temp = await createPerson({ name: `Queue temp ${run}` });
  await setClaim(adminClient, "contact_messages", id, temp.id);
  await temp.cleanup();
  expect(await claimOf("contact_messages", id)).toMatchObject({
    status: "new",
    claimed_by_person_id: null,
    claimed_at: null,
  });
});
