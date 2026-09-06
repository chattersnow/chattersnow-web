// Integration test: exercises the real partnership-opportunity Server Actions
// against a real local Supabase stack (checkUser/checkPermission, then real
// `partnership_opportunities` RLS). Partnerships share the `governance`
// resource key (admin and board manage; every other seeded role is 'none').
// Beyond the permission gate this covers the action's own precondition --
// organization_person_id is `not null` in the schema since 20260830110000, so
// the action has to refuse a missing organization before the insert rather
// than letting Postgres raise. Requires `bun run db:start && bun run db:reset`
// first; run via `bun run test:integration`. Not picked up by `bun run test`.
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

const {
  createPartnershipOpportunityAction,
  updatePartnershipOpportunityAction,
} = await import("./partnerships-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };
const NO_ORGANIZATION = {
  error: "Select or create the partner organization.",
};

// The table has no natural unique key and the seed holds rows of its own, so
// each test tags its row through `notes` and looks that up.
function uniqueTag() {
  return `IT partnership ${crypto.randomUUID()}`;
}

function partnershipForm(
  tag: string,
  overrides: { stage?: string; nextStepDate?: string } = {},
) {
  const fd = new FormData();
  fd.set("stage", overrides.stage ?? "prospecting");
  fd.set("nextStepDate", overrides.nextStepDate ?? "2026-12-15");
  fd.set("notes", tag);
  return fd;
}

async function partnershipRowFor(tag: string) {
  const { data, error } = await adminClient
    .from("partnership_opportunities")
    .select(
      "id, stage, next_step_date, notes, organization_person_id, owner_person_id",
    )
    .eq("notes", tag)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function cleanupPartnership(tag: string) {
  await adminClient.from("partnership_opportunities").delete().eq("notes", tag);
}

describe("partnership opportunity actions (integration)", () => {
  test("requires a signed-in user", async () => {
    const organization = await createPerson({ person_type: "organization" });
    currentSupabase = anonClient();

    expect(
      await createPartnershipOpportunityAction(
        organization.id,
        null,
        partnershipForm(uniqueTag()),
      ),
    ).toEqual({
      error: "You must be signed in to add a partnership opportunity.",
    });
    expect(
      await updatePartnershipOpportunityAction(
        crypto.randomUUID(),
        organization.id,
        null,
        partnershipForm(uniqueTag()),
      ),
    ).toEqual({
      error: "You must be signed in to update this partnership opportunity.",
    });

    await organization.cleanup();
  });

  test("admin role (governance manage) can add and update an opportunity", async () => {
    const tag = uniqueTag();
    const organization = await createPerson({ person_type: "organization" });
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createPartnershipOpportunityAction(
        organization.id,
        null,
        partnershipForm(tag),
      ),
    ).toEqual({ success: true });

    const created = await partnershipRowFor(tag);
    expect(created).not.toBeNull();
    expect(created!.stage).toBe("prospecting");
    expect(created!.organization_person_id).toBe(organization.id);

    expect(
      await updatePartnershipOpportunityAction(
        created!.id as string,
        organization.id,
        null,
        partnershipForm(tag, { stage: "closed_won" }),
      ),
    ).toEqual({ success: true });

    expect((await partnershipRowFor(tag))!.stage).toBe("closed_won");

    await cleanupPartnership(tag);
    await organization.cleanup();
  });

  test("board role (governance manage) can add an opportunity", async () => {
    const tag = uniqueTag();
    const organization = await createPerson({ person_type: "organization" });
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(
      await createPartnershipOpportunityAction(
        organization.id,
        null,
        partnershipForm(tag),
      ),
    ).toEqual({ success: true });
    expect(await partnershipRowFor(tag)).not.toBeNull();

    await cleanupPartnership(tag);
    await organization.cleanup();
  });

  test("stores the owner alongside the organization", async () => {
    const tag = uniqueTag();
    const organization = await createPerson({ person_type: "organization" });
    const owner = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createPartnershipOpportunityAction(
        organization.id,
        owner.id,
        partnershipForm(tag),
      ),
    ).toEqual({ success: true });

    const row = await partnershipRowFor(tag);
    expect(row!.organization_person_id).toBe(organization.id);
    expect(row!.owner_person_id).toBe(owner.id);

    await cleanupPartnership(tag);
    await owner.cleanup();
    await organization.cleanup();
  });

  test.each([
    ["coordinator", SEEDED_USERS.coordinator],
    ["finance", SEEDED_USERS.finance],
    ["volunteer", SEEDED_USERS.volunteer],
    ["noAccess", SEEDED_USERS.noAccess],
    ["former", SEEDED_USERS.former],
  ])(
    "%s role (no governance access) cannot add an opportunity",
    async (_label, email) => {
      const tag = uniqueTag();
      const organization = await createPerson({ person_type: "organization" });
      currentSupabase = await signInAs(email);

      expect(
        await createPartnershipOpportunityAction(
          organization.id,
          null,
          partnershipForm(tag),
        ),
      ).toEqual(DENIED);
      expect(await partnershipRowFor(tag)).toBeNull();

      await organization.cleanup();
    },
  );

  test("a role without governance access cannot move another team's opportunity", async () => {
    const tag = uniqueTag();
    const organization = await createPerson({ person_type: "organization" });

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    await createPartnershipOpportunityAction(
      organization.id,
      null,
      partnershipForm(tag),
    );
    const id = (await partnershipRowFor(tag))!.id as string;

    currentSupabase = await signInAs(SEEDED_USERS.finance);
    expect(
      await updatePartnershipOpportunityAction(
        id,
        organization.id,
        null,
        partnershipForm(tag, { stage: "closed_lost" }),
      ),
    ).toEqual(DENIED);

    expect((await partnershipRowFor(tag))!.stage).toBe("prospecting");

    await cleanupPartnership(tag);
    await organization.cleanup();
  });

  test("the organization is required, and is checked before the form is parsed", async () => {
    const tag = uniqueTag();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    // Both a missing organization and an invalid stage: the organization
    // check wins, proving it runs first and that `organization_person_id`
    // (not null in the schema) can never reach the insert as null.
    expect(
      await createPartnershipOpportunityAction(
        null,
        null,
        partnershipForm(tag, { stage: "not-a-stage" }),
      ),
    ).toEqual(NO_ORGANIZATION);
    expect(
      await updatePartnershipOpportunityAction(
        crypto.randomUUID(),
        null,
        null,
        partnershipForm(tag),
      ),
    ).toEqual(NO_ORGANIZATION);

    expect(await partnershipRowFor(tag)).toBeNull();
  });

  test("an invalid stage is refused before the insert", async () => {
    const tag = uniqueTag();
    const organization = await createPerson({ person_type: "organization" });
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createPartnershipOpportunityAction(
        organization.id,
        null,
        partnershipForm(tag, { stage: "not-a-stage" }),
      ),
    ).toEqual({ error: "Invalid stage." });
    expect(await partnershipRowFor(tag)).toBeNull();

    await organization.cleanup();
  });

  test("revalidates the partnerships list and the dashboard after a write", async () => {
    const tag = uniqueTag();
    const organization = await createPerson({ person_type: "organization" });
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    await createPartnershipOpportunityAction(
      organization.id,
      null,
      partnershipForm(tag),
    );

    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/governance/partnerships",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/home");

    await cleanupPartnership(tag);
    await organization.cleanup();
  });
});
