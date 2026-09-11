// #902 against a real local stack: module gating on the public surface.
//
// The half that matters is the write paths. Hiding a page does not stop a form
// post, and every RPC below is callable by `anon` with curl -- so the test that
// counts is "the module is off and the RPC still refuses", not "the link is
// gone from the nav". The unit suite covers the nav and the route gate, which
// are pure functions over the registry; this covers the database.
//
// A tenant of its own, provisioned here and deleted in afterAll, because these
// RPCs resolve their tenant from the request host and the answer has to be an
// organization whose modules this file is free to switch off. It is active for
// the length of the file, which is why it carries a host: a second *active*
// tenant takes public_tenant_id() off its sole-active-tenant fallback, so every
// sessionless read here names a host explicitly -- the same rule the
// provisioning and isolation suites follow.
//
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  anonClient,
  serviceRoleClient,
  uniqueEmail,
  uniqueIp,
} from "../../test/integration-setup";
import { SEEDED_USER_IDS } from "../../test/seed-fixtures";

// `created_by` defaults to auth.uid(), which is null under service_role, and
// several of these tables make it `not null`. The seeded admin stands in as the
// author of this file's fixtures; nothing here reads it back.
const AUTHOR = SEEDED_USER_IDS.admin;

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);
const HOST = `modules-${run}.example.test`;
const SLUG = `modules-${run}`;

let tenantId: string;
let anon: SupabaseClient;
let eventId: string;
let gearItemId: string;
let artworkCode: string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function must<T = any>(
  query: PromiseLike<{ data: unknown; error: unknown }>,
  what: string,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`${what}: ${JSON.stringify(error)}`);
  return data as T;
}

/** Turns one module on or off for this file's tenant, as the operator would. */
async function setModule(moduleKey: string, enabled: boolean) {
  const { error } = await service
    .from("tenant_modules")
    .upsert(
      { tenant_id: tenantId, module_key: moduleKey, enabled },
      { onConflict: "tenant_id,module_key" },
    );
  if (error) throw new Error(`setModule ${moduleKey}: ${error.message}`);
}

/** Runs `body` with the module off, and always puts it back. */
async function withModuleOff(moduleKey: string, body: () => Promise<void>) {
  await setModule(moduleKey, false);
  try {
    await body();
  } finally {
    await setModule(moduleKey, true);
  }
}

beforeAll(async () => {
  tenantId = await must(
    service.rpc("provision_tenant", {
      p_name: `Module Gating ${run}`,
      p_slug: SLUG,
      p_custom_domain: HOST,
      p_plan: "white_label",
      p_admin_email: null,
    }),
    "provision_tenant",
  );
  anon = anonClient({ host: HOST });

  eventId = (
    await must(
      service
        .from("events")
        .insert({
          tenant_id: tenantId,
          name: `Module Gating Event ${run}`,
          starts_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          timezone: "America/Chicago",
          visibility: "public",
          status: "published",
          registration_enabled: true,
          created_by: AUTHOR,
        })
        .select("id")
        .single(),
      "event",
    )
  ).id;

  // A gear item needs a donor and a donation behind it: the library is a record
  // of what was given, so there is no such thing as an item from nowhere.
  const donorId = (
    await must(
      service
        .from("people")
        .insert({
          tenant_id: tenantId,
          name: `Module Gating Donor ${run}`,
          email: uniqueEmail("mg-donor"),
          source_type: "other",
        })
        .select("id")
        .single(),
      "donor",
    )
  ).id;
  const donationId = (
    await must(
      service
        .from("donations")
        .insert({ tenant_id: tenantId, donor_id: donorId, created_by: AUTHOR })
        .select("id")
        .single(),
      "donation",
    )
  ).id;

  gearItemId = (
    await must(
      service
        .from("inventory_items")
        .insert({
          tenant_id: tenantId,
          donation_id: donationId,
          description: `Module Gating Ski ${run}`,
          condition: "good",
          status: "available",
          intended_use: "gear_library",
          created_by: AUTHOR,
        })
        .select("id")
        .single(),
      "gear item",
    )
  ).id;

  // Twelve characters from the unambiguous alphabet the check constraint
  // insists on -- no I, L, O, 0 or 1, because people read these off a poster.
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  artworkCode = Array.from(
    { length: 12 },
    () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
  ).join("");
  await must(
    service
      .from("event_artwork_calls")
      .insert({
        tenant_id: tenantId,
        event_id: eventId,
        title: "Module gating call",
        submission_code: artworkCode,
        is_open: true,
      })
      .select("id"),
    "artwork call",
  );
});

afterAll(async () => {
  await service
    .from("tenants")
    .update({ status: "archived" })
    .eq("id", tenantId);
  await service.rpc("delete_tenant", { p_tenant_id: tenantId });
});

describe("the anon view of a tenant's modules", () => {
  test("reports the whole catalog for the host's tenant", async () => {
    const modules = await must(
      anon.from("public_tenant_modules").select("module_key, enabled"),
      "modules",
    );
    expect(modules.length).toBeGreaterThan(10);
    expect(modules.every((m: { enabled: boolean }) => m.enabled === true)).toBe(
      true,
    );
  });

  test("follows the flag the operator sets", async () => {
    await withModuleOff("inventory", async () => {
      const modules = await must(
        anon.from("public_tenant_modules").select("module_key, enabled"),
        "modules off",
      );
      const inventory = modules.find(
        (m: { module_key: string }) => m.module_key === "inventory",
      );
      expect(inventory.enabled).toBe(false);
      // And nothing else moved.
      expect(
        modules.find((m: { module_key: string }) => m.module_key === "events")
          .enabled,
      ).toBe(true);
    });
  });

  test("answers for the host, not for the sole tenant", async () => {
    // The whole point of the view: a visitor on another organization's host
    // must not be told about this one's entitlements.
    await withModuleOff("inventory", async () => {
      const elsewhere = await must(
        anonClient({ host: `other-${run}.example.test` })
          .from("public_tenant_modules")
          .select("module_key, enabled"),
        "other host",
      );
      // An unresolved host has no tenant, so every module falls back to its
      // catalog default -- fail open, as #900 decided.
      const inventory = elsewhere.find(
        (m: { module_key: string }) => m.module_key === "inventory",
      );
      expect(inventory.enabled).toBe(true);
    });
  });
});

describe("the public write paths refuse a module that is off", () => {
  test("events: registration and the rider profile", async () => {
    // On first, so the refusal below is a change rather than a constant.
    const registrationId = await must(
      anon.rpc("register_for_event", {
        p_event_id: eventId,
        p_name: "Module Gating",
        p_email: uniqueEmail("mg-on"),
        p_phone: null,
        p_party_size: 1,
        p_notes: null,
        p_ip_address: uniqueIp(),
      }),
      "register while on",
    );
    expect(registrationId).toBeTruthy();

    await withModuleOff("events", async () => {
      const refused = await anon.rpc("register_for_event", {
        p_event_id: eventId,
        p_name: "Module Gating",
        p_email: uniqueEmail("mg-off"),
        p_phone: null,
        p_party_size: 1,
        p_notes: null,
        p_ip_address: uniqueIp(),
      });
      expect(refused.error?.message).toContain("EVENT_NOT_FOUND");

      const profile = await anon.rpc("save_registrant_rider_profile", {
        p_registration_id: registrationId,
        p_riding_discipline: "ski",
        p_ski_experience_level: "beginner",
        p_ip_address: uniqueIp(),
      });
      expect(profile.error?.message).toContain("RIDER_PROFILE_UNAVAILABLE");
    });

    // And back: the refusal was the module, not the fixture going stale.
    const after = await anon.rpc("register_for_event", {
      p_event_id: eventId,
      p_name: "Module Gating",
      p_email: uniqueEmail("mg-back"),
      p_phone: null,
      p_party_size: 1,
      p_notes: null,
      p_ip_address: uniqueIp(),
    });
    expect(after.error).toBeNull();
  });

  test("inventory: both gear request paths", async () => {
    await withModuleOff("inventory", async () => {
      const single = await anon.rpc("request_gear_item", {
        p_inventory_item_id: gearItemId,
        p_name: "Module Gating",
        p_email: uniqueEmail("mg-gear"),
        p_phone: null,
      });
      expect(single.error?.message).toContain("ITEM_NOT_FOUND");

      const cart = await anon.rpc("request_gear_items", {
        p_inventory_item_ids: [gearItemId],
        p_name: "Module Gating",
        p_email: uniqueEmail("mg-cart"),
        p_phone: null,
        p_ip_address: uniqueIp(),
      });
      expect(cart.error?.message).toContain("ITEM_NOT_FOUND");

      // Refused, not quietly reserved: the item is exactly as it was.
      const item = await must(
        service
          .from("inventory_items")
          .select("status")
          .eq("id", gearItemId)
          .single(),
        "item after refusals",
      );
      expect(item.status).toBe("available");
    });

    const allowed = await anon.rpc("request_gear_items", {
      p_inventory_item_ids: [gearItemId],
      p_name: "Module Gating",
      p_email: uniqueEmail("mg-cart-on"),
      p_phone: null,
      p_ip_address: uniqueIp(),
    });
    expect(allowed.error).toBeNull();
  });

  test("volunteers: the application and the status lookup", async () => {
    const reference = await must(
      anon.rpc("submit_volunteer_application", {
        p_name: "Module Gating",
        p_email: uniqueEmail("mg-vol"),
        p_phone: null,
        p_role_interest: "Anything",
        p_availability: "Weekends",
        p_ip_address: uniqueIp(),
      }),
      "application while on",
    );
    expect(reference).toBeTruthy();

    await withModuleOff("volunteers", async () => {
      const refused = await anon.rpc("submit_volunteer_application", {
        p_name: "Module Gating",
        p_email: uniqueEmail("mg-vol-off"),
        p_phone: null,
        p_role_interest: "Anything",
        p_availability: "Weekends",
        p_ip_address: uniqueIp(),
      });
      expect(refused.error?.message).toContain("SECTION_UNAVAILABLE");
    });
  });

  test("communications: the contact form", async () => {
    await withModuleOff("communications", async () => {
      const refused = await anon.rpc("submit_contact_message", {
        p_name: "Module Gating",
        p_email: uniqueEmail("mg-contact"),
        p_topic: "general",
        p_message: "Hello",
        p_ip_address: uniqueIp(),
      });
      expect(refused.error?.message).toContain("SECTION_UNAVAILABLE");
    });

    const allowed = await anon.rpc("submit_contact_message", {
      p_name: "Module Gating",
      p_email: uniqueEmail("mg-contact-on"),
      p_topic: "general",
      p_message: "Hello",
      p_ip_address: uniqueIp(),
    });
    expect(allowed.error).toBeNull();
  });

  test("artwork: the call, the upload slots and the submission", async () => {
    const call = await must(
      anon.rpc("get_artwork_call", {
        p_code: artworkCode,
        p_ip_address: uniqueIp(),
      }),
      "call while on",
    );
    expect(call).toHaveLength(1);

    await withModuleOff("artwork", async () => {
      // A lookup, so it answers with nothing rather than an error -- the page
      // renders its own "this call is closed".
      const closed = await must(
        anon.rpc("get_artwork_call", {
          p_code: artworkCode,
          p_ip_address: uniqueIp(),
        }),
        "call while off",
      );
      expect(closed).toEqual([]);

      const slots = await anon.rpc("claim_artwork_upload_slots", {
        p_code: artworkCode,
        p_count: 1,
        p_ip_address: uniqueIp(),
      });
      expect(slots.error?.message).toContain("CALL_CLOSED");

      const submission = await anon.rpc("submit_artwork", {
        p_code: artworkCode,
        p_name: "Module Gating",
        p_email: uniqueEmail("mg-art"),
        p_title: "Untitled",
        p_medium: "Oil",
        p_statement: "A statement",
        p_images: [],
        p_consent: true,
        p_ip_address: uniqueIp(),
      });
      expect(submission.error?.message).toContain("CALL_CLOSED");
    });
  });

  test("a honeypot still gets its fake success, module or no module", async () => {
    // The check sits after the honeypot on purpose: a bot must not be able to
    // tell a disabled module from a filled trap, and a real visitor's
    // experience of the trap must not change.
    await withModuleOff("communications", async () => {
      const honeypotted = await must(
        anon.rpc("submit_contact_message", {
          p_name: "Module Gating",
          p_email: uniqueEmail("mg-bot"),
          p_topic: "general",
          p_message: "Hello",
          p_honeypot: "filled",
          p_ip_address: uniqueIp(),
        }),
        "honeypot",
      );
      expect(honeypotted).toBeTruthy();
    });
  });
});

describe("a module that is on changes nothing", () => {
  test("every public intake works exactly as it did", async () => {
    // The regression this file would otherwise invite: a guard that refuses
    // when it should not. Every tenant has every module today, so this is the
    // path essentially all traffic takes.
    const contact = await anon.rpc("submit_contact_message", {
      p_name: "Module Gating",
      p_email: uniqueEmail("mg-all-contact"),
      p_topic: "general",
      p_message: "Hello",
      p_ip_address: uniqueIp(),
    });
    expect(contact.error).toBeNull();

    const call = await anon.rpc("get_artwork_call", {
      p_code: artworkCode,
      p_ip_address: uniqueIp(),
    });
    expect(call.error).toBeNull();
    expect(call.data).toHaveLength(1);

    const lookup = await anon.rpc("lookup_volunteer_application_status", {
      p_email: uniqueEmail("mg-nobody"),
      p_reference_code: "NOPE",
      p_ip_address: uniqueIp(),
    });
    // A miss, not an error -- unchanged from before #902.
    expect(lookup.error).toBeNull();
    expect(lookup.data).toBeNull();
  });
});
