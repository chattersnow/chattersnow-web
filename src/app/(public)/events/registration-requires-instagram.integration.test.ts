// Integration test for the per-tenant Instagram requirement (#1647), against
// the real RPCs on a local Supabase stack: off, registration is unchanged and
// the no-Instagram fields are stored as null; on, neither form nor the RPC
// registers without a valid handle or a complete no-Instagram contact; the
// setting is one tenant's alone; and the answers link is issued for an event
// with no questions, shows no stored detail and changes the contact.
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPublishedEvent,
  seededTenantId,
  serviceRoleClient,
  signInAs,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";
import { mintConfirmationToken } from "@/lib/notifications/notification-email-token";

mock.module("next/cache", () => ({ revalidatePath: () => {} }));
mock.module("server-only", () => ({}));
const nextServer = await import("next/server");
mock.module("next/server", () => ({ ...nextServer, after: () => {} }));

let currentIp: string | null = null;
mock.module("@/lib/get-client-ip", () => ({
  getClientIp: async () => currentIp,
}));
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => anonClient(),
}));

const { registerForEventAction } = await import("./event-registration-actions");

const SETTING_KEY = "registration.requires_instagram";
const service = serviceRoleClient();
const tenantId = await seededTenantId();
const run = crypto.randomUUID().slice(0, 8);
// No registration questions: the answers link must still be issued (#1647).
const fixture = await createPublishedEvent({
  name: `Instagram setting ${run}`,
});
const registeredEmails: string[] = [];

async function setSetting(value: boolean | null, tenant = tenantId) {
  const { error } =
    value === null
      ? await service
          .from("app_settings")
          .delete()
          .eq("tenant_id", tenant)
          .eq("key", SETTING_KEY)
      : await service
          .from("app_settings")
          .upsert(
            { tenant_id: tenant, key: SETTING_KEY, value },
            { onConflict: "tenant_id,key" },
          );
  if (error) throw error;
}

afterEach(() => setSetting(null));

afterAll(async () => {
  await setSetting(null);
  await fixture.cleanup();
  if (registeredEmails.length) {
    await service.from("people").delete().in("email", registeredEmails);
  }
});

function nextEmail() {
  const email = uniqueEmail(`instagram-setting-${run}`);
  registeredEmails.push(email);
  return email;
}

/** Straight at the RPC, as the public API calls it. */
async function registerDirect(fields: Record<string, unknown>) {
  const email = nextEmail();
  const { data, error } = await anonClient().rpc("register_for_event", {
    p_event_id: fixture.id,
    p_name: "Instagram Setting Registrant",
    p_email: email,
    p_phone: null,
    p_party_size: 1,
    p_notes: null,
    p_ip_address: uniqueIp(),
    ...fields,
  } as never);
  return { id: data as string | null, email, error };
}

async function stored(email: string) {
  const { data, error } = await service
    .from("event_registrations")
    .select(
      "id, instagram_handle, has_no_instagram, preferred_contact_method, preferred_contact_detail",
    )
    .eq("event_id", fixture.id)
    .eq("email", email)
    .single();
  if (error) throw error;
  return data;
}

const NO_INSTAGRAM = {
  p_has_no_instagram: true,
  p_preferred_contact_method: "text",
  p_preferred_contact_detail: "555-0142",
};

describe("with the setting off (no row)", () => {
  test("registers without a handle, and the no-Instagram fields are stored as null", async () => {
    const { email, error } = await registerDirect(NO_INSTAGRAM);
    expect(error).toBeNull();
    expect(await stored(email)).toMatchObject({
      instagram_handle: null,
      has_no_instagram: null,
      preferred_contact_method: null,
      preferred_contact_detail: null,
    });
  });

  test("the handle is stored as given, as before", async () => {
    const { email, error } = await registerDirect({
      p_instagram_handle: "Jamie.Rides",
    });
    expect(error).toBeNull();
    expect((await stored(email)).instagram_handle).toBe("Jamie.Rides");
  });

  test("issues no answers link for an event with no questions", async () => {
    const { id } = await registerDirect({});
    const { data, error } = await service.rpc(
      "issue_registration_answer_link",
      {
        p_registration_id: id!,
        p_token_hash: mintConfirmationToken().hash,
        p_source: "confirmation",
      },
    );
    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});

describe("with the setting on", () => {
  test("the RPC refuses neither a handle nor a contact", async () => {
    await setSetting(true);
    const { error } = await registerDirect({});
    expect(error?.message).toBe("INSTAGRAM_OR_CONTACT_REQUIRED");
  });

  test("the RPC refuses an incomplete no-Instagram contact and a bad handle", async () => {
    await setSetting(true);
    expect(
      (
        await registerDirect({
          p_has_no_instagram: true,
          p_preferred_contact_method: "text",
        })
      ).error?.message,
    ).toBe("INSTAGRAM_OR_CONTACT_REQUIRED");
    expect(
      (
        await registerDirect({
          p_has_no_instagram: true,
          p_preferred_contact_method: "pigeon",
          p_preferred_contact_detail: "the roof",
        })
      ).error?.message,
    ).toBe("PREFERRED_CONTACT_INVALID");
    expect(
      (await registerDirect({ p_instagram_handle: "not a handle!" })).error
        ?.message,
    ).toBe("INSTAGRAM_HANDLE_INVALID");
  });

  test("a handle is normalized and stored with has_no_instagram false", async () => {
    await setSetting(true);
    const { email, error } = await registerDirect({
      p_instagram_handle: "https://instagram.com/Jamie.Rides/",
    });
    expect(error).toBeNull();
    expect(await stored(email)).toMatchObject({
      instagram_handle: "jamie.rides",
      has_no_instagram: false,
      preferred_contact_method: null,
      preferred_contact_detail: null,
    });
  });

  test("a complete no-Instagram contact is stored, and email may leave the detail blank", async () => {
    await setSetting(true);
    const text = await registerDirect(NO_INSTAGRAM);
    expect(text.error).toBeNull();
    expect(await stored(text.email)).toMatchObject({
      instagram_handle: null,
      has_no_instagram: true,
      preferred_contact_method: "text",
      preferred_contact_detail: "555-0142",
    });

    const email = await registerDirect({
      p_has_no_instagram: true,
      p_preferred_contact_method: "email",
    });
    expect(email.error).toBeNull();
    expect(await stored(email.email)).toMatchObject({
      preferred_contact_method: "email",
      preferred_contact_detail: null,
    });
  });

  test("the form refuses without either, on About you", async () => {
    await setSetting(true);
    currentIp = uniqueIp();
    const fd = new FormData();
    fd.set("name", "Instagram Setting Registrant");
    fd.set("email", nextEmail());
    fd.set("instagramRequired", "on");

    const result = await registerForEventAction(fixture.id, fd);
    expect(result).toMatchObject({ step: "about" });
  });

  test("the form registers without Instagram and hands back an answers link", async () => {
    await setSetting(true);
    currentIp = uniqueIp();
    const email = nextEmail();
    const fd = new FormData();
    fd.set("name", "Instagram Setting Registrant");
    fd.set("email", email);
    fd.set("instagramRequired", "on");
    fd.set("noInstagram", "on");
    fd.set("preferredContactMethod", "whatsapp");
    fd.set("preferredContactDetail", "+1 555 0142");

    const result = await registerForEventAction(fixture.id, fd);
    expect(result).toMatchObject({ success: true });
    // The event asks no questions: the link exists because of the setting.
    expect("answersPath" in result ? result.answersPath : null).not.toBeNull();
    expect(await stored(email)).toMatchObject({
      has_no_instagram: true,
      preferred_contact_method: "whatsapp",
      preferred_contact_detail: "+1 555 0142",
    });
  });

  test("the public form reads it as on", async () => {
    await setSetting(true);
    const { data, error } = await anonClient()
      .from("public_registration_settings")
      .select("requires_instagram")
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ requires_instagram: true });
  });
});

describe("one tenant's setting", () => {
  test("does not reach another tenant", async () => {
    const { data: otherId, error } = await service.rpc("provision_tenant", {
      p_name: `Instagram B ${run}`,
      p_slug: `instagram-b-${run}`,
      p_custom_domain: `instagram-b-${run}.example.test`,
      p_plan: "white_label",
      p_admin_email: null,
    });
    expect(error).toBeNull();
    const tenantB = otherId as string;
    // Out of host resolution at once: a second active tenant with no request
    // host to match would take the public site down for every other test
    // (#795). The setting is read by tenant id, so its status is no matter.
    await service
      .from("tenants")
      .update({ status: "archived" })
      .eq("id", tenantB);
    try {
      await setSetting(true, tenantB);

      // B requires it; A -- the tenant the public host resolves to -- has no
      // row, and registers without a handle.
      expect(
        (
          await service.rpc("tenant_requires_instagram", {
            p_tenant_id: tenantB,
          })
        ).data,
      ).toBe(true);
      expect(
        (
          await service.rpc("tenant_requires_instagram", {
            p_tenant_id: tenantId,
          })
        ).data,
      ).toBe(false);
      const { error: registered } = await registerDirect({});
      expect(registered).toBeNull();
      const { data } = await anonClient()
        .from("public_registration_settings")
        .select("requires_instagram")
        .single();
      expect(data).toEqual({ requires_instagram: false });
    } finally {
      await service.rpc("delete_tenant", { p_tenant_id: tenantB });
    }
  });
});

describe("the answers link", () => {
  async function issueLink(registrationId: string) {
    const { hash } = mintConfirmationToken();
    const { data, error } = await service.rpc(
      "issue_registration_answer_link",
      {
        p_registration_id: registrationId,
        p_token_hash: hash,
        p_source: "confirmation",
      },
    );
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    return hash;
  }

  test("shows the method but never the detail, and changes the contact", async () => {
    await setSetting(true);
    const { id, email } = await registerDirect(NO_INSTAGRAM);
    const hash = await issueLink(id!);

    const read = await anonClient().rpc("get_registration_answer_request", {
      p_token_hash: hash,
      p_ip_address: uniqueIp(),
    });
    expect(read.error).toBeNull();
    const contact = (read.data as { contact: Record<string, unknown> }).contact;
    expect(contact).toEqual({
      instagram_handle: null,
      has_no_instagram: true,
      preferred_contact_method: "text",
    });
    expect(JSON.stringify(read.data)).not.toContain("555-0142");

    // Held to the same rule as registering.
    const refused = await anonClient().rpc(
      "submit_registration_contact_by_token",
      {
        p_token_hash: hash,
        p_instagram_handle: null,
        p_has_no_instagram: true,
        p_preferred_contact_method: "call",
        p_preferred_contact_detail: null,
        p_ip_address: uniqueIp(),
      },
    );
    expect(refused.error?.message).toBe("INSTAGRAM_OR_CONTACT_REQUIRED");

    const saved = await anonClient().rpc(
      "submit_registration_contact_by_token",
      {
        p_token_hash: hash,
        p_instagram_handle: "@jamie.rides",
        p_has_no_instagram: false,
        p_preferred_contact_method: null,
        p_preferred_contact_detail: null,
        p_ip_address: uniqueIp(),
      },
    );
    expect(saved.error).toBeNull();
    expect(await stored(email)).toMatchObject({
      instagram_handle: "jamie.rides",
      has_no_instagram: false,
      preferred_contact_method: null,
      preferred_contact_detail: null,
    });
  });

  test("refuses a change once the organization stops asking", async () => {
    await setSetting(true);
    const { id } = await registerDirect(NO_INSTAGRAM);
    const hash = await issueLink(id!);
    await setSetting(false);

    const { error } = await anonClient().rpc(
      "submit_registration_contact_by_token",
      {
        p_token_hash: hash,
        p_instagram_handle: "jamie",
        p_has_no_instagram: false,
        p_preferred_contact_method: null,
        p_preferred_contact_detail: null,
        p_ip_address: uniqueIp(),
      },
    );
    expect(error?.message).toBe("CONTACT_NOT_ASKED");
  });

  test("a dead token is LINK_INVALID", async () => {
    const { error } = await anonClient().rpc(
      "submit_registration_contact_by_token",
      {
        p_token_hash: mintConfirmationToken().hash,
        p_instagram_handle: "jamie",
        p_has_no_instagram: false,
        p_preferred_contact_method: null,
        p_preferred_contact_detail: null,
        p_ip_address: uniqueIp(),
      },
    );
    expect(error?.message).toBe("LINK_INVALID");
  });
});

describe("staff", () => {
  test("edit it without being held to the requirement", async () => {
    await setSetting(true);
    const { id, email } = await registerDirect({ p_instagram_handle: "jamie" });

    const cleared = await adminClient.rpc("set_registration_contact", {
      p_registration_id: id!,
      p_instagram_handle: null,
      p_has_no_instagram: null,
      p_preferred_contact_method: null,
      p_preferred_contact_detail: null,
    });
    expect(cleared.error).toBeNull();
    expect((await stored(email)).instagram_handle).toBeNull();

    const contact = await adminClient.rpc("set_registration_contact", {
      p_registration_id: id!,
      p_instagram_handle: null,
      p_has_no_instagram: true,
      p_preferred_contact_method: "email",
      p_preferred_contact_detail: null,
    });
    expect(contact.error).toBeNull();
    expect(await stored(email)).toMatchObject({
      has_no_instagram: true,
      preferred_contact_method: "email",
    });
  });

  // `volunteer` holds events:view and nothing higher.
  test("cannot without events:manage", async () => {
    const { id } = await registerDirect({});
    const volunteer = await signInAs(SEEDED_USERS.volunteer);
    const { error } = await volunteer.rpc("set_registration_contact", {
      p_registration_id: id!,
      p_instagram_handle: "jamie",
      p_has_no_instagram: null,
      p_preferred_contact_method: null,
      p_preferred_contact_detail: null,
    });
    expect(error?.message).toBe("PERMISSION_DENIED");
  });

  test("an events manager turns the setting on and off; nobody else can", async () => {
    expect(
      await adminClient.rpc("registration_requires_instagram"),
    ).toMatchObject({ data: false, error: null });
    expect(
      (
        await adminClient.rpc("set_registration_requires_instagram", {
          p_enabled: true,
        })
      ).error,
    ).toBeNull();
    expect(
      (await adminClient.rpc("registration_requires_instagram")).data,
    ).toBe(true);

    const volunteer = await signInAs(SEEDED_USERS.volunteer);
    for (const client of [volunteer, anonClient()]) {
      const { error } = await client.rpc(
        "set_registration_requires_instagram",
        { p_enabled: false },
      );
      expect(error).not.toBeNull();
    }
    expect(
      (await volunteer.rpc("registration_requires_instagram")).data,
    ).toBeNull();
  });
});
