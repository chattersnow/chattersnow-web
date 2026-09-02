// Integration test: exercises the real event sponsor Server Actions against a
// real local Supabase stack (checkPermission, then real `event_sponsors`
// RLS). `event_sponsors` is gated on the shared `events` resource -- select
// on events:view, writes on events:manage (20260822100000) -- so the
// interesting cases are the view-only roles (finance, volunteer), which can
// read the sponsor list but must not be able to change it.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPerson,
  createPublishedEvent,
  signInAs,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  listEventSponsorsAction,
  createEventSponsorAction,
  updateEventSponsorAction,
  deleteEventSponsorAction,
} = await import("./sponsors-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function sponsorForm(
  overrides: {
    notes?: string;
    supportType?: string;
    inKindDescription?: string;
    contributionValue?: string;
  } = {},
) {
  const fd = new FormData();
  fd.set("supportType", overrides.supportType ?? "in_kind");
  fd.set(
    "inKindDescription",
    overrides.inKindDescription ?? "Donated 20 pairs of gloves",
  );
  fd.set("contributionValue", overrides.contributionValue ?? "250");
  fd.set("isPublic", "on");
  fd.set("notes", overrides.notes ?? "Confirmed by phone");
  fd.set("followUpStatus", "in_progress");
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

describe("event sponsor actions (integration)", () => {
  test("requires a signed-in user to add a sponsor", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = anonClient();

    const result = await createEventSponsorAction(
      event.id,
      person.id,
      sponsorForm(),
    );
    expect(result).toEqual({
      error: "You must be signed in to add a sponsor.",
    });

    await event.cleanup();
    await person.cleanup();
  });

  test("admin role (events manage) can create, list, update, and delete a sponsor", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createEventSponsorAction(event.id, person.id, sponsorForm()),
    ).toEqual({ success: true });

    const listed = await listEventSponsorsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0].person.id).toBe(person.id);
    expect(listed.data[0].follow_up_status).toBe("in_progress");

    expect(
      await updateEventSponsorAction(
        listed.data[0].id,
        sponsorForm({ notes: "Signed agreement received" }),
      ),
    ).toEqual({ success: true });

    const afterUpdate = await listEventSponsorsAction(event.id);
    if (!("data" in afterUpdate)) throw new Error("expected data");
    expect(afterUpdate.data[0].notes).toBe("Signed agreement received");

    expect(await deleteEventSponsorAction(listed.data[0].id)).toEqual({
      success: true,
    });

    const afterDelete = await listEventSponsorsAction(event.id);
    if (!("data" in afterDelete)) throw new Error("expected data");
    expect(afterDelete.data).toHaveLength(0);

    await event.cleanup();
    await person.cleanup();
  });

  test("event_coordinator role (events manage) can add a sponsor", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(
      await createEventSponsorAction(event.id, person.id, sponsorForm()),
    ).toEqual({ success: true });

    await event.cleanup();
    await person.cleanup();
  });

  test("finance role (events view only) can list but not write sponsors", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    expect("data" in (await listEventSponsorsAction(event.id))).toBe(true);
    expect(
      await createEventSponsorAction(event.id, person.id, sponsorForm()),
    ).toEqual(DENIED);
    expect(
      await updateEventSponsorAction(crypto.randomUUID(), sponsorForm()),
    ).toEqual(DENIED);
    expect(await deleteEventSponsorAction(crypto.randomUUID())).toEqual(DENIED);

    await event.cleanup();
    await person.cleanup();
  });

  test("volunteer role (events view only) can list but not add sponsors", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    expect("data" in (await listEventSponsorsAction(event.id))).toBe(true);
    expect(
      await createEventSponsorAction(event.id, person.id, sponsorForm()),
    ).toEqual(DENIED);

    await event.cleanup();
    await person.cleanup();
  });

  test("board role (no events access) can neither list nor add sponsors", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await listEventSponsorsAction(event.id)).toEqual(DENIED);
    expect(
      await createEventSponsorAction(event.id, person.id, sponsorForm()),
    ).toEqual(DENIED);

    await event.cleanup();
    await person.cleanup();
  });

  test("a deactivated (former) account cannot add a sponsor", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.former);

    expect(
      await createEventSponsorAction(event.id, person.id, sponsorForm()),
    ).toEqual(DENIED);

    await event.cleanup();
    await person.cleanup();
  });
});

// Issue #520: a sponsor contribution must mirror into the same
// donations/monetary_donations tables Finance > Donations, Inventory >
// Donations, and the event's own Donations tab read from -- otherwise it's
// invisible everywhere but the Sponsors tab. These exercise the
// create_event_sponsor/update_event_sponsor/delete_event_sponsor RPCs
// (20260830180000) that keep the mirror in sync.
describe("event sponsor contributions sync into donations/monetary_donations (integration)", () => {
  test("a cash sponsor mirrors into monetary_donations, syncs on update, and is removed on delete", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const created = await createEventSponsorAction(
      event.id,
      person.id,
      sponsorForm({ supportType: "cash", contributionValue: "500" }),
    );
    expect(created).toEqual({ success: true });

    const listed = await listEventSponsorsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    const sponsor = listed.data[0];
    expect(sponsor.monetary_donation_id).not.toBeNull();
    expect(sponsor.donation_id).toBeNull();

    const { data: monetaryRow } = await adminClient
      .from("monetary_donations")
      .select("amount, donor_id, event_id")
      .eq("id", sponsor.monetary_donation_id!)
      .single();
    expect(Number(monetaryRow!.amount)).toBe(500);
    expect(monetaryRow!.donor_id).toBe(person.id);
    expect(monetaryRow!.event_id).toBe(event.id);

    await updateEventSponsorAction(
      sponsor.id,
      sponsorForm({ supportType: "cash", contributionValue: "750" }),
    );
    const { data: updatedRow } = await adminClient
      .from("monetary_donations")
      .select("amount")
      .eq("id", sponsor.monetary_donation_id!)
      .single();
    expect(Number(updatedRow!.amount)).toBe(750);

    await deleteEventSponsorAction(sponsor.id);
    const { data: afterDelete } = await adminClient
      .from("monetary_donations")
      .select("id")
      .eq("id", sponsor.monetary_donation_id!)
      .maybeSingle();
    expect(afterDelete).toBeNull();

    await event.cleanup();
    await person.cleanup();
  });

  test("an in-kind sponsor mirrors into donations + inventory_items, syncs on update, and is removed on delete", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const created = await createEventSponsorAction(
      event.id,
      person.id,
      sponsorForm({
        supportType: "in_kind",
        inKindDescription: "20 pairs of gloves",
        contributionValue: "300",
      }),
    );
    expect(created).toEqual({ success: true });

    const listed = await listEventSponsorsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    const sponsor = listed.data[0];
    expect(sponsor.donation_id).not.toBeNull();
    expect(sponsor.inventory_item_id).not.toBeNull();
    expect(sponsor.monetary_donation_id).toBeNull();

    const { data: donationRow } = await adminClient
      .from("donations")
      .select("donor_id, event_id")
      .eq("id", sponsor.donation_id!)
      .single();
    expect(donationRow!.donor_id).toBe(person.id);
    expect(donationRow!.event_id).toBe(event.id);

    const { data: itemRow } = await adminClient
      .from("inventory_items")
      .select("description, face_value")
      .eq("id", sponsor.inventory_item_id!)
      .single();
    expect(itemRow!.description).toBe("20 pairs of gloves");
    expect(Number(itemRow!.face_value)).toBe(300);

    await updateEventSponsorAction(
      sponsor.id,
      sponsorForm({
        supportType: "in_kind",
        inKindDescription: "25 pairs of gloves",
        contributionValue: "350",
      }),
    );
    const { data: updatedItem } = await adminClient
      .from("inventory_items")
      .select("description, face_value")
      .eq("id", sponsor.inventory_item_id!)
      .single();
    expect(updatedItem!.description).toBe("25 pairs of gloves");
    expect(Number(updatedItem!.face_value)).toBe(350);

    await deleteEventSponsorAction(sponsor.id);
    const { data: afterDeleteDonation } = await adminClient
      .from("donations")
      .select("id")
      .eq("id", sponsor.donation_id!)
      .maybeSingle();
    expect(afterDeleteDonation).toBeNull();
    const { data: afterDeleteItem } = await adminClient
      .from("inventory_items")
      .select("id")
      .eq("id", sponsor.inventory_item_id!)
      .maybeSingle();
    expect(afterDeleteItem).toBeNull();

    await event.cleanup();
    await person.cleanup();
  });

  test("'both' and 'other' support types do not mirror into either table", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    await createEventSponsorAction(
      event.id,
      person.id,
      sponsorForm({ supportType: "both", contributionValue: "400" }),
    );
    const listed = await listEventSponsorsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data[0].donation_id).toBeNull();
    expect(listed.data[0].monetary_donation_id).toBeNull();

    await deleteEventSponsorAction(listed.data[0].id);
    await event.cleanup();
    await person.cleanup();
  });
});
