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

type ItemInput = {
  id?: string;
  description: string;
  faceValue?: string;
  intendedUse?: string;
};

function sponsorForm(
  overrides: {
    notes?: string;
    supportType?: string;
    items?: ItemInput[];
    contributionValue?: string;
  } = {},
) {
  const fd = new FormData();
  fd.set("supportType", overrides.supportType ?? "in_kind");
  fd.set(
    "items",
    JSON.stringify(
      overrides.items ?? [{ description: "Donated 20 pairs of gloves" }],
    ),
  );
  fd.set("contributionValue", overrides.contributionValue ?? "250");
  fd.set("isPublic", "on");
  fd.set("notes", overrides.notes ?? "Confirmed by phone");
  fd.set("followUpStatus", "in_progress");
  return fd;
}

/** The sponsorship's items, newest listing. `listEventSponsorsAction` merges
 *  them in from `list_event_sponsor_items`, which is the only path the portal
 *  has to them -- event_coordinator holds no inventory permission. */
async function itemsFor(eventId: string, sponsorId: string) {
  const listed = await listEventSponsorsAction(eventId);
  if (!("data" in listed)) throw new Error("expected data");
  const sponsor = listed.data.find((row) => row.id === sponsorId);
  if (!sponsor) throw new Error("sponsor not found");
  return sponsor.items;
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

    // The sponsor has to go through the action, not with the event: an
    // in-kind contribution mirrors into `donations` + inventory
    // (20260830180000), and those survive the event as orphans -- so the
    // delete guard (20260903060000) refuses to remove the event until the
    // sponsor delete has unwound them.
    const listed = await listEventSponsorsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(await deleteEventSponsorAction(listed.data[0].id)).toEqual({
      success: true,
    });

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

  test("an in-kind sponsor mirrors into donations + one inventory_items row per item", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const created = await createEventSponsorAction(
      event.id,
      person.id,
      sponsorForm({
        supportType: "in_kind",
        items: [
          { description: "Season lift tickets (4)", faceValue: "720" },
          { description: "Goggles", faceValue: "90" },
          {
            description: "20 pairs of gloves",
            faceValue: "300",
            intendedUse: "gear_library",
          },
        ],
        contributionValue: "1110",
      }),
    );
    expect(created).toEqual({ success: true });

    const listed = await listEventSponsorsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    const sponsor = listed.data[0];
    expect(sponsor.donation_id).not.toBeNull();
    expect(sponsor.monetary_donation_id).toBeNull();
    expect(sponsor.items).toHaveLength(3);
    // Derived from the items rather than typed, so the two can never disagree.
    expect(sponsor.in_kind_description).toBe(
      "Season lift tickets (4), Goggles, 20 pairs of gloves",
    );

    const { data: donationRow } = await adminClient
      .from("donations")
      .select("donor_id, event_id")
      .eq("id", sponsor.donation_id!)
      .single();
    expect(donationRow!.donor_id).toBe(person.id);
    expect(donationRow!.event_id).toBe(event.id);

    // Three real inventory rows under the one donation -- which is what makes
    // each of them separately pickable as a giveaway prize source.
    const { data: itemRows } = await adminClient
      .from("inventory_items")
      .select("id, description, face_value, intended_use")
      .eq("donation_id", sponsor.donation_id!)
      .order("created_at");
    expect(itemRows).toHaveLength(3);
    expect(itemRows!.map((row) => row.description)).toEqual([
      "Season lift tickets (4)",
      "Goggles",
      "20 pairs of gloves",
    ]);
    expect(Number(itemRows![0].face_value)).toBe(720);

    // Sponsor contributions default to prize stock, so a voucher never reads as
    // gear the community can take home -- but an item the staffer sends to the
    // gear library does reach the public catalog, which is new in #1005.
    expect(itemRows!.map((row) => row.intended_use)).toEqual([
      "giveaway",
      "giveaway",
      "gear_library",
    ]);

    const anon = anonClient();
    const { data: giveawayItemInCatalog } = await anon
      .from("public_gear_catalog")
      .select("id")
      .eq("id", itemRows![0].id)
      .maybeSingle();
    expect(giveawayItemInCatalog).toBeNull();
    const { data: gearItemInCatalog } = await anon
      .from("public_gear_catalog")
      .select("id")
      .eq("id", itemRows![2].id)
      .maybeSingle();
    expect(gearItemInCatalog).not.toBeNull();

    // Every item gets its intake movement, same as any other donated gear.
    const { count: movementCount } = await adminClient
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .in(
        "inventory_item_id",
        itemRows!.map((row) => row.id),
      );
    expect(movementCount).toBe(3);

    await deleteEventSponsorAction(sponsor.id);
    const { data: afterDeleteDonation } = await adminClient
      .from("donations")
      .select("id")
      .eq("id", sponsor.donation_id!)
      .maybeSingle();
    expect(afterDeleteDonation).toBeNull();
    const { count: afterDeleteItems } = await adminClient
      .from("inventory_items")
      .select("id", { count: "exact", head: true })
      .eq("donation_id", sponsor.donation_id!);
    expect(afterDeleteItems).toBe(0);

    await event.cleanup();
    await person.cleanup();
  });

  test("an update edits the items it names, adds new ones, and removes the rest", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    await createEventSponsorAction(
      event.id,
      person.id,
      sponsorForm({
        items: [
          { description: "Board", faceValue: "450" },
          { description: "Goggles", faceValue: "90" },
        ],
      }),
    );
    const listed = await listEventSponsorsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    const sponsor = listed.data[0];
    const [board, goggles] = sponsor.items;

    await updateEventSponsorAction(
      sponsor.id,
      sponsorForm({
        items: [
          // Kept and edited: same id, new value and a new destination.
          {
            id: board.id,
            description: "Board, 158cm",
            faceValue: "500",
            intendedUse: "gear_library",
          },
          // Added.
          { description: "Beanie", faceValue: "20" },
          // Goggles omitted, so it goes.
        ],
      }),
    );

    const after = await itemsFor(event.id, sponsor.id);
    expect(after.map((item) => item.description)).toEqual([
      "Board, 158cm",
      "Beanie",
    ]);
    expect(after[0].id).toBe(board.id);
    expect(Number(after[0].face_value)).toBe(500);
    expect(after[0].intended_use).toBe("gear_library");

    const { data: removed } = await adminClient
      .from("inventory_items")
      .select("id")
      .eq("id", goggles.id)
      .maybeSingle();
    expect(removed).toBeNull();

    await deleteEventSponsorAction(sponsor.id);
    await event.cleanup();
    await person.cleanup();
  });

  test("removing an item a giveaway prize claims is refused, not silently allowed", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    await createEventSponsorAction(
      event.id,
      person.id,
      sponsorForm({ items: [{ description: "Board", faceValue: "450" }] }),
    );
    const listed = await listEventSponsorsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    const sponsor = listed.data[0];
    const item = sponsor.items[0];

    const { data: giveaway } = await adminClient
      .from("giveaways")
      .insert({ event_id: event.id, name: "Spring draw" })
      .select("id")
      .single();
    await adminClient.from("giveaway_prizes").insert({
      giveaway_id: giveaway!.id,
      prize_name: "Grand prize",
      source_inventory_item_id: item.id,
    });

    // `source_inventory_item_id` is `on delete set null`, so an unguarded
    // delete would empty the prize in place and say nothing.
    const result = await updateEventSponsorAction(
      sponsor.id,
      sponsorForm({ items: [{ description: "Beanie", faceValue: "20" }] }),
    );
    expect("error" in result && result.error).toContain(
      "before removing the item",
    );

    const { data: stillThere } = await adminClient
      .from("inventory_items")
      .select("id")
      .eq("id", item.id)
      .maybeSingle();
    expect(stillThere).not.toBeNull();

    // And the tab is told, so it can disable that row's remove button rather
    // than let the staffer walk into the exception.
    expect((await itemsFor(event.id, sponsor.id))[0].allocated).toBe(true);

    await adminClient
      .from("giveaway_prizes")
      .delete()
      .eq("giveaway_id", giveaway!.id);
    await adminClient.from("giveaways").delete().eq("id", giveaway!.id);
    await deleteEventSponsorAction(sponsor.id);
    await event.cleanup();
    await person.cleanup();
  });

  test("'both' mirrors its in-kind half; 'other' mirrors nothing", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    // The cash half of 'both' is still not mirrored -- one contribution_value
    // cannot be split into cash and goods without inventing a number -- but the
    // goods half has its own values now, so it is no longer invisible.
    await createEventSponsorAction(
      event.id,
      person.id,
      sponsorForm({
        supportType: "both",
        contributionValue: "400",
        items: [{ description: "Raffle jackets", faceValue: "150" }],
      }),
    );
    const both = await listEventSponsorsAction(event.id);
    if (!("data" in both)) throw new Error("expected data");
    expect(both.data[0].donation_id).not.toBeNull();
    expect(both.data[0].monetary_donation_id).toBeNull();
    expect(both.data[0].items).toHaveLength(1);
    await deleteEventSponsorAction(both.data[0].id);

    await createEventSponsorAction(
      event.id,
      person.id,
      sponsorForm({
        supportType: "other",
        contributionValue: "400",
        items: [{ description: "Ignored", faceValue: "150" }],
      }),
    );
    const other = await listEventSponsorsAction(event.id);
    if (!("data" in other)) throw new Error("expected data");
    expect(other.data[0].donation_id).toBeNull();
    expect(other.data[0].monetary_donation_id).toBeNull();
    expect(other.data[0].items).toEqual([]);

    await deleteEventSponsorAction(other.data[0].id);
    await event.cleanup();
    await person.cleanup();
  });
});
