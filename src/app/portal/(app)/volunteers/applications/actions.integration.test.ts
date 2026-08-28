// Integration test: exercises the real
// updateVolunteerApplicationStatusAction against a real local Supabase stack
// (checkUser/checkPermission, then real `volunteer_applications` RLS). This
// is the only Server Action this resource exposes -- the applications list
// page reads the table directly under the same `volunteers` RLS policies.
// Per §5.3, `volunteers` is admin manage, event_coordinator/volunteer view,
// finance/board none. Requires `bun run db:start && bun run db:reset` first;
// run via `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPerson,
  signInAs,
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

// volunteer_applications.person_id is not-null and has no FK cascade
// registered from a helper, so fixtures create their own person and clean up
// both rows.
async function seedApplication() {
  const person = await createPerson();
  const { data, error } = await adminClient
    .from("volunteer_applications")
    .insert({
      person_id: person.id,
      name: `Integration Test Applicant ${crypto.randomUUID()}`,
      email: `it-${crypto.randomUUID()}@example.test`,
      status: "new",
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  return {
    id,
    async cleanup() {
      await adminClient.from("volunteer_applications").delete().eq("id", id);
      await person.cleanup();
    },
  };
}

async function statusOf(id: string) {
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
    const result = await updateVolunteerApplicationStatusAction(
      crypto.randomUUID(),
      "contacted",
    );
    expect(result).toEqual({
      error: "You must be signed in to update a volunteer application.",
    });
  });

  test("admin role (volunteers manage) can update an application's status", async () => {
    const application = await seedApplication();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const result = await updateVolunteerApplicationStatusAction(
      application.id,
      "contacted",
    );
    expect(result).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/volunteers/applications",
    );
    expect(await statusOf(application.id)).toBe("contacted");

    await application.cleanup();
  });

  test("rejects a status outside the allowed set", async () => {
    const application = await seedApplication();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const result = await updateVolunteerApplicationStatusAction(
      application.id,
      "approved" as never,
    );
    expect(result).toEqual({ error: "Not a valid status." });
    expect(await statusOf(application.id)).toBe("new");

    await application.cleanup();
  });

  test("event_coordinator role (volunteers view only) cannot update an application's status", async () => {
    const application = await seedApplication();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    const result = await updateVolunteerApplicationStatusAction(
      application.id,
      "contacted",
    );
    expect(result).toEqual(DENIED);
    expect(await statusOf(application.id)).toBe("new");

    await application.cleanup();
  });

  test("volunteer role (volunteers view only) cannot update an application's status", async () => {
    const application = await seedApplication();
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    const result = await updateVolunteerApplicationStatusAction(
      application.id,
      "contacted",
    );
    expect(result).toEqual(DENIED);

    await application.cleanup();
  });

  test("finance role (no volunteers access) cannot update an application's status", async () => {
    const application = await seedApplication();
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    const result = await updateVolunteerApplicationStatusAction(
      application.id,
      "contacted",
    );
    expect(result).toEqual(DENIED);

    await application.cleanup();
  });

  test("a deactivated (former) account cannot update an application's status", async () => {
    const application = await seedApplication();
    currentSupabase = await signInAs(SEEDED_USERS.former);

    const result = await updateVolunteerApplicationStatusAction(
      application.id,
      "contacted",
    );
    expect(result).toEqual(DENIED);

    await application.cleanup();
  });
});
