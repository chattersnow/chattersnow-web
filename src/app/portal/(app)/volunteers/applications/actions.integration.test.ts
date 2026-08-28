// Integration test: exercises the real updateVolunteerApplicationStatusAction
// against a real local Supabase stack (checkUser/checkPermission, then real
// `volunteer_applications` RLS). The queue is gated on the `volunteers`
// resource (admin manages; event_coordinator/volunteer view; finance/board
// have none), so what this file proves is that the action asks for that key
// at the right level -- a wrong key or a missing check here would not be
// caught anywhere else. Fixtures go through the real public
// submit_volunteer_application RPC, the only insert path the table has.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VolunteerApplicationStatus } from "./application-types";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  signInAs,
  uniqueEmail,
  uniqueIp,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { updateVolunteerApplicationStatusAction } = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

// The table only grants select/update/delete to authenticated -- rows are
// created through the public intake RPC, so fixtures use the same path.
// Each fixture gets a fresh email (never deduped, never throttled) and a
// fresh IP for the per-IP rate limit.
async function createApplication() {
  const { data: referenceCode, error } = await anonClient().rpc(
    "submit_volunteer_application",
    {
      p_name: `Integration Test Applicant ${crypto.randomUUID()}`,
      p_email: uniqueEmail("vol-app"),
      p_phone: null,
      p_role_interest: "Ride Buddy",
      p_availability: "Weekends",
      p_honeypot: null,
      p_ip_address: uniqueIp(),
    },
  );
  if (error) throw error;

  // The RPC returns the applicant-facing reference code, not the row id
  // (see 20260827010000), so resolve the actual row from it.
  const { data: row, error: rowError } = await adminClient
    .from("volunteer_applications")
    .select("id, person_id")
    .eq("reference_code", referenceCode as string)
    .single();
  if (rowError) throw rowError;

  const id = row.id as string;
  const personId = row.person_id as string;
  return {
    id,
    // The RPC also creates a backing `people` row; nothing else references
    // it, so delete it once the application row is gone.
    async cleanup() {
      await adminClient.from("volunteer_applications").delete().eq("id", id);
      await adminClient.from("people").delete().eq("id", personId);
    },
  };
}

async function applicationStatus(id: string) {
  const { data, error } = await adminClient
    .from("volunteer_applications")
    .select("status")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data.status as string;
}

describe("updateVolunteerApplicationStatusAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    expect(
      await updateVolunteerApplicationStatusAction(
        crypto.randomUUID(),
        "contacted",
      ),
    ).toEqual({
      error: "You must be signed in to update a volunteer application.",
    });
  });

  test("admin role (volunteers manage) can update an application's status", async () => {
    const application = await createApplication();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await updateVolunteerApplicationStatusAction(
        application.id,
        "being reviewed",
      ),
    ).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/volunteers/applications",
    );
    expect(await applicationStatus(application.id)).toBe("being reviewed");

    await application.cleanup();
  });

  test("rejects a status outside the allowed set, even for admin", async () => {
    const application = await createApplication();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await updateVolunteerApplicationStatusAction(
        application.id,
        "hired" as VolunteerApplicationStatus,
      ),
    ).toEqual({ error: "Not a valid status." });
    expect(await applicationStatus(application.id)).toBe("new");

    await application.cleanup();
  });

  async function expectNoWriteAccess(email: string) {
    const application = await createApplication();
    currentSupabase = await signInAs(email);

    expect(
      await updateVolunteerApplicationStatusAction(application.id, "contacted"),
    ).toEqual(DENIED);

    // The denied update must not have landed: the action refuses it, and the
    // `volunteer_applications update` policy would too.
    expect(await applicationStatus(application.id)).toBe("new");

    await application.cleanup();
  }

  test("event_coordinator role (volunteers view) cannot update an application", async () => {
    await expectNoWriteAccess(SEEDED_USERS.coordinator);
  });

  test("volunteer role (volunteers view) cannot update an application", async () => {
    await expectNoWriteAccess(SEEDED_USERS.volunteer);
  });

  test("finance role (no volunteers access) cannot update an application", async () => {
    await expectNoWriteAccess(SEEDED_USERS.finance);
  });

  test("a deactivated (former) account cannot update an application", async () => {
    await expectNoWriteAccess(SEEDED_USERS.former);
  });
});
