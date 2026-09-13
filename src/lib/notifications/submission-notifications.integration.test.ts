// Integration coverage for the two event-triggered sends (#742) against a real
// local Supabase stack: who is resolved, the two gates that decide whether
// anything goes out, and the ledger that stops one submission being announced
// twice.
//
// RESEND_API_KEY is unset here (as it is in CI), so sendEmail() logs and
// returns success without contacting a provider -- which is the point: the
// lookup, both gates and every ledger write are exercised end to end with no
// mail leaving the building.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import {
  SEEDED_USERS,
  anonClient,
  createAvailableGearItems,
  createVolunteerApplication,
  deleteContactMessages,
  serviceRoleClient,
  uniqueEmail,
  uniqueIp,
} from "../../../test/integration-setup";
import {
  EMAIL_ENABLED_SETTING_KEY,
  GEAR_REQUEST_CONFIRMATION_KIND,
} from "./kinds";

// submission-notifications.ts, deliver.ts and the send helper all import
// "server-only", which throws outside Next's bundler.
mock.module("server-only", () => ({}));
const {
  CONTACT_MESSAGE_KIND,
  GEAR_REQUEST_KIND,
  VOLUNTEER_APPLICATION_KIND,
  notifyNewContactMessage,
  notifyNewGearRequest,
  notifyNewVolunteerApplication,
  sendGearRequestConfirmation,
} = await import("./submission-notifications");

const service = serviceRoleClient();
const SITE_URL = "https://chattersnow.example";

/** Every kind this file creates rows for. Nothing seeded uses any of them. */
const KINDS = [
  VOLUNTEER_APPLICATION_KIND,
  CONTACT_MESSAGE_KIND,
  GEAR_REQUEST_KIND,
  GEAR_REQUEST_CONFIRMATION_KIND,
];

let tenantId: string;
let adminPersonId: string;
const contactEmails: string[] = [];
const applicationCleanups: (() => Promise<void>)[] = [];
const gearCleanups: (() => Promise<void>)[] = [];
const requesterEmails: string[] = [];

beforeAll(async () => {
  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (tenantError) throw tenantError;
  tenantId = tenant.id as string;

  // The seeded admin is the only account holding volunteers:manage and
  // communications:manage, so it is the whole recipient list here.
  const { data: person, error: personError } = await service
    .from("people")
    .select("id")
    .eq("email", SEEDED_USERS.admin)
    .single();
  if (personError) throw personError;
  adminPersonId = person.id as string;
});

afterEach(async () => {
  // By kind, not by person: supabase/seed.sql opts the admin in to
  // task_digest and records one delivery for them, and the tenant-isolation
  // suite needs both of those rows to still be there.
  await service.from("notification_deliveries").delete().in("kind", KINDS);
  await service
    .from("person_notification_preferences")
    .delete()
    .in("kind", KINDS);
  await setOrgEmailEnabled(null);
});

afterAll(async () => {
  for (const cleanup of applicationCleanups) await cleanup();
  for (const email of contactEmails) await deleteContactMessages(email);
  // The gear fixtures first (their cleanup finds the request through the
  // movements), then the requester people rows nothing references any more.
  for (const cleanup of gearCleanups) await cleanup();
  if (requesterEmails.length) {
    await service.from("people").delete().in("email", requesterEmails);
  }
});

/** A public gear request from a fresh requester, through the real RPC. */
async function newGearRequest(): Promise<{ id: string; email: string }> {
  const fixture = await createAvailableGearItems(2);
  gearCleanups.push(fixture.cleanup);
  const email = uniqueEmail("gear-notify");
  requesterEmails.push(email);
  const { data, error } = await anonClient().rpc("request_gear_items", {
    p_inventory_item_ids: fixture.itemIds,
    p_name: "Integration Test Requester",
    p_email: email,
    p_phone: null,
    p_notes: "Any size works.",
    p_honeypot: null,
    // A fresh IP per fixture: the RPC's own per-IP limit is 8 per 15 minutes.
    p_ip_address: uniqueIp(),
  });
  if (error) throw error;
  return { id: data as string, email };
}

/** null removes the row, which is what an unset switch looks like. */
async function setOrgEmailEnabled(enabled: boolean | null) {
  if (enabled === null) {
    await service
      .from("app_settings")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("key", EMAIL_ENABLED_SETTING_KEY);
    return;
  }
  const { error } = await service
    .from("app_settings")
    .upsert(
      { tenant_id: tenantId, key: EMAIL_ENABLED_SETTING_KEY, value: enabled },
      { onConflict: "tenant_id,key" },
    );
  if (error) throw error;
}

async function optIn(kind: string, enabled: boolean) {
  const { error } = await service
    .from("person_notification_preferences")
    .upsert(
      { tenant_id: tenantId, person_id: adminPersonId, kind, enabled },
      { onConflict: "tenant_id,person_id,kind" },
    );
  if (error) throw error;
}

async function deliveries(kind: string) {
  const { data, error } = await service
    .from("notification_deliveries")
    .select("person_id, dedupe_key, status, error")
    .eq("kind", kind);
  if (error) throw error;
  return data ?? [];
}

async function newApplication() {
  const application = await createVolunteerApplication();
  applicationCleanups.push(application.cleanup);
  return application;
}

async function newContactMessage() {
  const email = uniqueEmail("contact-notify");
  contactEmails.push(email);
  const { data, error } = await anonClient().rpc("submit_contact_message", {
    p_name: "Integration Test Sender",
    p_email: email,
    p_topic: "general",
    p_message: "Hello from the integration suite.",
    p_honeypot: null,
    // A fresh IP per fixture: the RPC's own per-IP limit is 5 per 15 minutes.
    p_ip_address: uniqueIp(),
  });
  if (error) throw error;
  return data as string;
}

describe("a new volunteer application", () => {
  test("reaches an opted-in volunteers:manage holder", async () => {
    await optIn(VOLUNTEER_APPLICATION_KIND, true);
    const application = await newApplication();

    const summary = await notifyNewVolunteerApplication(service, {
      tenantId,
      referenceCode: application.referenceCode,
      siteUrl: SITE_URL,
    });

    expect(summary).toEqual({
      considered: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    });
    const rows = await deliveries(VOLUNTEER_APPLICATION_KIND);
    expect(rows).toHaveLength(1);
    expect(rows[0].person_id).toBe(adminPersonId);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].dedupe_key).toBe(
      `${VOLUNTEER_APPLICATION_KIND}:${application.id}`,
    );
  });

  test("reaches nobody who has not opted in", async () => {
    const application = await newApplication();

    const summary = await notifyNewVolunteerApplication(service, {
      tenantId,
      referenceCode: application.referenceCode,
      siteUrl: SITE_URL,
    });

    // Considered, then skipped: the person holds the permission, they just
    // never asked to hear about it. No row means no email.
    expect(summary.considered).toBe(1);
    expect(summary.sent).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(await deliveries(VOLUNTEER_APPLICATION_KIND)).toEqual([]);
  });

  test("honors an explicit opt-out", async () => {
    await optIn(VOLUNTEER_APPLICATION_KIND, false);
    const application = await newApplication();

    const summary = await notifyNewVolunteerApplication(service, {
      tenantId,
      referenceCode: application.referenceCode,
      siteUrl: SITE_URL,
    });

    expect(summary.sent).toBe(0);
    expect(await deliveries(VOLUNTEER_APPLICATION_KIND)).toEqual([]);
  });

  test("sends nothing while the tenant's switch is off", async () => {
    await optIn(VOLUNTEER_APPLICATION_KIND, true);
    await setOrgEmailEnabled(false);
    const application = await newApplication();

    const summary = await notifyNewVolunteerApplication(service, {
      tenantId,
      referenceCode: application.referenceCode,
      siteUrl: SITE_URL,
    });

    // Nobody is even resolved: a muted tenant costs one read and stops.
    expect(summary).toEqual({ considered: 0, sent: 0, skipped: 0, failed: 0 });
    expect(await deliveries(VOLUNTEER_APPLICATION_KIND)).toEqual([]);
  });

  test("says nothing at all about a filled honeypot", async () => {
    await optIn(VOLUNTEER_APPLICATION_KIND, true);

    // What submit_volunteer_application() hands back when the honeypot is
    // filled: a well-formed reference code for a row it never inserted.
    const summary = await notifyNewVolunteerApplication(service, {
      tenantId,
      referenceCode: "ZZZZZZZZ",
      siteUrl: SITE_URL,
    });

    expect(summary).toEqual({ considered: 0, sent: 0, skipped: 0, failed: 0 });
    expect(await deliveries(VOLUNTEER_APPLICATION_KIND)).toEqual([]);
  });
});

describe("a new contact message", () => {
  test("reaches an opted-in ops-inbox holder", async () => {
    await optIn(CONTACT_MESSAGE_KIND, true);
    const messageId = await newContactMessage();

    const summary = await notifyNewContactMessage(service, {
      messageId,
      siteUrl: SITE_URL,
    });

    expect(summary.sent).toBe(1);
    const rows = await deliveries(CONTACT_MESSAGE_KIND);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].dedupe_key).toBe(`${CONTACT_MESSAGE_KIND}:${messageId}`);
  });

  test("reaches nobody who has not opted in", async () => {
    const messageId = await newContactMessage();

    const summary = await notifyNewContactMessage(service, {
      messageId,
      siteUrl: SITE_URL,
    });

    expect(summary.sent).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(await deliveries(CONTACT_MESSAGE_KIND)).toEqual([]);
  });

  test("says nothing at all about a filled honeypot", async () => {
    await optIn(CONTACT_MESSAGE_KIND, true);

    // submit_contact_message() answers a filled honeypot with a
    // gen_random_uuid() for a row it never inserted.
    const summary = await notifyNewContactMessage(service, {
      messageId: crypto.randomUUID(),
      siteUrl: SITE_URL,
    });

    expect(summary).toEqual({ considered: 0, sent: 0, skipped: 0, failed: 0 });
    expect(await deliveries(CONTACT_MESSAGE_KIND)).toEqual([]);
  });
});

describe("the ledger", () => {
  test("a repeated call for one submission notifies once", async () => {
    await optIn(VOLUNTEER_APPLICATION_KIND, true);
    const application = await newApplication();
    const call = () =>
      notifyNewVolunteerApplication(service, {
        tenantId,
        referenceCode: application.referenceCode,
        siteUrl: SITE_URL,
      });

    expect((await call()).sent).toBe(1);
    const second = await call();

    // The second claim loses the unique constraint and stops there, which is
    // the whole reason the row is written before the send rather than after.
    expect(second.sent).toBe(0);
    expect(second.skipped).toBe(1);
    expect(await deliveries(VOLUNTEER_APPLICATION_KIND)).toHaveLength(1);
  });

  test("two submissions notify twice", async () => {
    await optIn(VOLUNTEER_APPLICATION_KIND, true);
    const first = await newApplication();
    const second = await newApplication();

    await notifyNewVolunteerApplication(service, {
      tenantId,
      referenceCode: first.referenceCode,
      siteUrl: SITE_URL,
    });
    await notifyNewVolunteerApplication(service, {
      tenantId,
      referenceCode: second.referenceCode,
      siteUrl: SITE_URL,
    });

    const rows = await deliveries(VOLUNTEER_APPLICATION_KIND);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.dedupe_key)).size).toBe(2);
  });
});

// #1032. Two sends per request: the inventory managers' notice, which goes
// through the same gates as the three above, and the requester's own
// confirmation, which has no preference to honour.
describe("a new gear request", () => {
  test("reaches an opted-in inventory:manage holder", async () => {
    await optIn(GEAR_REQUEST_KIND, true);
    const request = await newGearRequest();

    const summary = await notifyNewGearRequest(service, {
      requestId: request.id,
      siteUrl: SITE_URL,
    });

    expect(summary).toEqual({
      considered: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    });
    const rows = await deliveries(GEAR_REQUEST_KIND);
    expect(rows).toHaveLength(1);
    expect(rows[0].person_id).toBe(adminPersonId);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].dedupe_key).toBe(`${GEAR_REQUEST_KIND}:${request.id}`);
  });

  test("reaches nobody who has not opted in", async () => {
    const request = await newGearRequest();

    const summary = await notifyNewGearRequest(service, {
      requestId: request.id,
      siteUrl: SITE_URL,
    });

    expect(summary.considered).toBe(1);
    expect(summary.sent).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(await deliveries(GEAR_REQUEST_KIND)).toEqual([]);
  });

  test("says nothing at all about a filled honeypot", async () => {
    await optIn(GEAR_REQUEST_KIND, true);

    // What request_gear_items() hands back when the honeypot is filled: a
    // uuid for a row it never inserted.
    const summary = await notifyNewGearRequest(service, {
      requestId: crypto.randomUUID(),
      siteUrl: SITE_URL,
    });

    expect(summary).toEqual({ considered: 0, sent: 0, skipped: 0, failed: 0 });
    expect(await deliveries(GEAR_REQUEST_KIND)).toEqual([]);
  });

  test("confirms to the requester, ledgered against their people row", async () => {
    const request = await newGearRequest();

    const outcome = await sendGearRequestConfirmation(service, {
      requestId: request.id,
      siteUrl: SITE_URL,
    });
    expect(outcome).toBe("sent");

    const { data: person } = await service
      .from("people")
      .select("id")
      .eq("email", request.email)
      .single();
    const rows = await deliveries(GEAR_REQUEST_CONFIRMATION_KIND);
    expect(rows).toHaveLength(1);
    expect(rows[0].person_id).toBe(person!.id);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].dedupe_key).toBe(
      `${GEAR_REQUEST_CONFIRMATION_KIND}:${request.id}`,
    );

    // A retried action sends the confirmation once.
    expect(
      await sendGearRequestConfirmation(service, {
        requestId: request.id,
        siteUrl: SITE_URL,
      }),
    ).toBe("skipped");
    expect(await deliveries(GEAR_REQUEST_CONFIRMATION_KIND)).toHaveLength(1);
  });

  test("the confirmation honours the tenant's switch and ignores a honeypot", async () => {
    await setOrgEmailEnabled(false);
    const request = await newGearRequest();

    expect(
      await sendGearRequestConfirmation(service, {
        requestId: request.id,
        siteUrl: SITE_URL,
      }),
    ).toBe("skipped");
    expect(
      await sendGearRequestConfirmation(service, {
        requestId: crypto.randomUUID(),
        siteUrl: SITE_URL,
      }),
    ).toBe("skipped");
    expect(await deliveries(GEAR_REQUEST_CONFIRMATION_KIND)).toEqual([]);
  });
});
