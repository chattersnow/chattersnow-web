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
  createPerson,
  createPublishedEvent,
  createVolunteerApplication,
  deleteContactMessages,
  serviceRoleClient,
  uniqueEmail,
  uniqueIp,
} from "../../../test/integration-setup";
import {
  EMAIL_ENABLED_SETTING_KEY,
  EVENT_REGISTRATION_CONFIRMATION_KIND,
  GEAR_REQUEST_CONFIRMATION_KIND,
  VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
} from "./kinds";
import { resendDedupeSuffix } from "@/lib/outbound-messages";

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
  notifyVolunteerApplicationConfirmation,
  sendEventRegistrationConfirmation,
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
  EVENT_REGISTRATION_CONFIRMATION_KIND,
  VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
];

let tenantId: string;
let adminPersonId: string;
const contactEmails: string[] = [];
const applicationCleanups: (() => Promise<void>)[] = [];
const gearCleanups: (() => Promise<void>)[] = [];
const eventCleanups: (() => Promise<void>)[] = [];
const personCleanups: (() => Promise<void>)[] = [];
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
  // Nothing seeded writes these, so the tenant is back to the platform's own
  // wording for the next test.
  await service.from("auto_reply_templates").delete().eq("tenant_id", tenantId);
  await setOrgEmailEnabled(null);
});

afterAll(async () => {
  for (const cleanup of applicationCleanups) await cleanup();
  for (const email of contactEmails) await deleteContactMessages(email);
  // The gear fixtures first (their cleanup finds the request through the
  // movements), then the requester people rows nothing references any more.
  for (const cleanup of gearCleanups) await cleanup();
  // Events before those people rows too: deleteEvent() clears the event's
  // registrations, which are what reference them.
  for (const cleanup of eventCleanups) await cleanup();
  for (const cleanup of personCleanups) await cleanup();
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

/**
 * The tenant's own auto-reply row (#1233): the per-kind switch, and whatever
 * slots they rewrote. Absent is what a tenant who never opened the editor
 * looks like, which is every other test in this file.
 */
async function setAutoReply(
  kind: string,
  row: { enabled?: boolean; slots?: Record<string, string> },
) {
  const { error } = await service.from("auto_reply_templates").upsert(
    {
      tenant_id: tenantId,
      kind,
      enabled: row.enabled ?? true,
      slots: row.slots ?? {},
    },
    { onConflict: "tenant_id,kind" },
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

/** A public event registration from a fresh registrant, through the real RPC. */
async function newEventRegistration(
  overrides: Parameters<typeof createPublishedEvent>[0] = {},
) {
  const event = await createPublishedEvent(overrides);
  eventCleanups.push(event.cleanup);
  const email = uniqueEmail("event-notify");
  requesterEmails.push(email);
  const { data, error } = await anonClient().rpc("register_for_event", {
    p_event_id: event.id,
    p_name: "Integration Test Registrant",
    p_email: email,
    p_phone: null,
    p_party_size: 2,
    p_notes: "Bringing a friend.",
    p_honeypot: null,
    // A fresh IP per fixture: the RPC's own per-IP limit is 8 per 15 minutes.
    p_ip_address: uniqueIp(),
  });
  if (error) throw error;
  return { id: data as string, email, eventId: event.id };
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

  // #1203. Resending is the answer to "I never received it", and it only
  // works because the key varies: on the original key the second send loses
  // the ledger race and returns `skipped`, which reads at the call site as
  // though it went.
  test("a resend carries its own key, and the same key twice sends once", async () => {
    const request = await newGearRequest();
    expect(
      await sendGearRequestConfirmation(service, {
        requestId: request.id,
        siteUrl: SITE_URL,
      }),
    ).toBe("sent");

    const suffix = resendDedupeSuffix(new Date("2026-09-16T14:31:00.000Z"));
    expect(
      await sendGearRequestConfirmation(service, {
        requestId: request.id,
        siteUrl: SITE_URL,
        dedupeSuffix: suffix,
      }),
    ).toBe("sent");

    const rows = await deliveries(GEAR_REQUEST_CONFIRMATION_KIND);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.dedupe_key).sort()).toEqual(
      [
        `${GEAR_REQUEST_CONFIRMATION_KIND}:${request.id}`,
        `${GEAR_REQUEST_CONFIRMATION_KIND}:${request.id}:${suffix}`,
      ].sort(),
    );

    // Twice inside the same minute is a double-click, not a second request.
    expect(
      await sendGearRequestConfirmation(service, {
        requestId: request.id,
        siteUrl: SITE_URL,
        dedupeSuffix: suffix,
      }),
    ).toBe("skipped");
    expect(await deliveries(GEAR_REQUEST_CONFIRMATION_KIND)).toHaveLength(2);

    // A minute later it may go again: that is a person asking twice.
    expect(
      await sendGearRequestConfirmation(service, {
        requestId: request.id,
        siteUrl: SITE_URL,
        dedupeSuffix: resendDedupeSuffix(new Date("2026-09-16T14:32:00.000Z")),
      }),
    ).toBe("sent");
    expect(await deliveries(GEAR_REQUEST_CONFIRMATION_KIND)).toHaveLength(3);
  });

  test("onRendered fires only when the claim was won", async () => {
    const request = await newGearRequest();
    const subjects: string[] = [];

    await sendGearRequestConfirmation(service, {
      requestId: request.id,
      siteUrl: SITE_URL,
      onRendered: (email) => subjects.push(email.subject),
    });
    expect(subjects).toHaveLength(1);
    expect(subjects[0]).toBeTruthy();

    // The losing send renders nothing, so a caller recording what it sent
    // cannot record a message that never existed.
    await sendGearRequestConfirmation(service, {
      requestId: request.id,
      siteUrl: SITE_URL,
      onRendered: (email) => subjects.push(email.subject),
    });
    expect(subjects).toHaveLength(1);
  });
});

// #1068. One send per registration, with no preference to honour: the
// registrant holds no account, so only the tenant's own switch can stop it.
describe("a new event registration", () => {
  test("confirms to the registrant, ledgered against their people row", async () => {
    const registration = await newEventRegistration();

    expect(
      await sendEventRegistrationConfirmation(service, {
        registrationId: registration.id,
        siteUrl: SITE_URL,
      }),
    ).toBe("sent");

    const { data: person } = await service
      .from("people")
      .select("id")
      .eq("email", registration.email)
      .single();
    const rows = await deliveries(EVENT_REGISTRATION_CONFIRMATION_KIND);
    expect(rows).toHaveLength(1);
    expect(rows[0].person_id).toBe(person!.id);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].dedupe_key).toBe(
      `${EVENT_REGISTRATION_CONFIRMATION_KIND}:${registration.id}`,
    );

    // A retried Server Action confirms once.
    expect(
      await sendEventRegistrationConfirmation(service, {
        registrationId: registration.id,
        siteUrl: SITE_URL,
      }),
    ).toBe("skipped");
    expect(await deliveries(EVENT_REGISTRATION_CONFIRMATION_KIND)).toHaveLength(
      1,
    );
  });

  test("sends for an event with an end time and a place, same as without", async () => {
    // The renderer's two branches are unit-tested; this is here to prove the
    // sender reads both columns without tripping over either.
    const registration = await newEventRegistration({
      endsAt: new Date(Date.now() + 27 * 60 * 60 * 1000).toISOString(),
      timezone: "America/Denver",
    });

    expect(
      await sendEventRegistrationConfirmation(service, {
        registrationId: registration.id,
        siteUrl: SITE_URL,
      }),
    ).toBe("sent");
  });

  test("honours the tenant's switch and ignores a honeypot", async () => {
    await setOrgEmailEnabled(false);
    const registration = await newEventRegistration();

    expect(
      await sendEventRegistrationConfirmation(service, {
        registrationId: registration.id,
        siteUrl: SITE_URL,
      }),
    ).toBe("skipped");
    // What register_for_event() hands back for a filled honeypot: a uuid for a
    // row it never inserted.
    expect(
      await sendEventRegistrationConfirmation(service, {
        registrationId: crypto.randomUUID(),
        siteUrl: SITE_URL,
      }),
    ).toBe("skipped");
    expect(await deliveries(EVENT_REGISTRATION_CONFIRMATION_KIND)).toEqual([]);
  });

  test("skips a registration with no address rather than failing", async () => {
    // The shape 20260901010000 exists for: a walk-in added from the portal
    // whose people row carries no email. The public form cannot produce it, so
    // it is built here directly.
    const event = await createPublishedEvent();
    eventCleanups.push(event.cleanup);
    const person = await createPerson({ name: "Walk-in With No Address" });
    // Popped after the event's cleanup, which has to clear the registration
    // referencing this row first.
    personCleanups.push(person.cleanup);

    const { error: insertError } = await service
      .from("event_registrations")
      .insert({
        tenant_id: tenantId,
        event_id: event.id,
        name: "Walk-in With No Address",
        email: "",
        party_size: 1,
        person_id: person.id,
      });
    if (insertError) throw insertError;

    const { data: row } = await service
      .from("event_registrations")
      .select("id")
      .eq("event_id", event.id)
      .single();

    expect(
      await sendEventRegistrationConfirmation(service, {
        registrationId: row!.id as string,
        siteUrl: SITE_URL,
      }),
    ).toBe("skipped");
    expect(await deliveries(EVENT_REGISTRATION_CONFIRMATION_KIND)).toEqual([]);
  });
});

// #1069. Two sends per application: the volunteers queue's notice, which goes
// through the opt-in gate, and the applicant's own confirmation carrying the
// reference code, which has no preference to honour.
describe("a volunteer application confirmation", () => {
  test("sends the applicant their code, ledgered against their people row", async () => {
    const application = await newApplication();

    expect(
      await notifyVolunteerApplicationConfirmation(service, {
        tenantId,
        referenceCode: application.referenceCode,
        siteUrl: SITE_URL,
      }),
    ).toBe("sent");

    const { data: person } = await service
      .from("people")
      .select("id")
      .eq("email", application.email)
      .single();
    const rows = await deliveries(VOLUNTEER_APPLICATION_CONFIRMATION_KIND);
    expect(rows).toHaveLength(1);
    expect(rows[0].person_id).toBe(person!.id);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].dedupe_key).toBe(
      `${VOLUNTEER_APPLICATION_CONFIRMATION_KIND}:${application.id}`,
    );

    // A retried Server Action confirms once.
    expect(
      await notifyVolunteerApplicationConfirmation(service, {
        tenantId,
        referenceCode: application.referenceCode,
        siteUrl: SITE_URL,
      }),
    ).toBe("skipped");
    expect(
      await deliveries(VOLUNTEER_APPLICATION_CONFIRMATION_KIND),
    ).toHaveLength(1);
  });

  test("is independent of the staff notice, which has its own gate", async () => {
    // The applicant hears either way; the queue only hears if somebody opted
    // in. Nobody has here, so exactly one of the two sends anything.
    await optIn(VOLUNTEER_APPLICATION_KIND, false);
    const application = await newApplication();

    const [staff, applicant] = await Promise.all([
      notifyNewVolunteerApplication(service, {
        tenantId,
        referenceCode: application.referenceCode,
        siteUrl: SITE_URL,
      }),
      notifyVolunteerApplicationConfirmation(service, {
        tenantId,
        referenceCode: application.referenceCode,
        siteUrl: SITE_URL,
      }),
    ]);

    expect(staff.sent).toBe(0);
    expect(staff.skipped).toBe(1);
    expect(applicant).toBe("sent");
    expect(await deliveries(VOLUNTEER_APPLICATION_KIND)).toEqual([]);
    expect(
      await deliveries(VOLUNTEER_APPLICATION_CONFIRMATION_KIND),
    ).toHaveLength(1);
  });

  test("both sends are ledgered separately when both go out", async () => {
    await optIn(VOLUNTEER_APPLICATION_KIND, true);
    const application = await newApplication();

    await Promise.all([
      notifyNewVolunteerApplication(service, {
        tenantId,
        referenceCode: application.referenceCode,
        siteUrl: SITE_URL,
      }),
      notifyVolunteerApplicationConfirmation(service, {
        tenantId,
        referenceCode: application.referenceCode,
        siteUrl: SITE_URL,
      }),
    ]);

    // Different kinds, so the ledger's unique constraint never makes one
    // collide with the other even though both are keyed on the same row.
    expect(await deliveries(VOLUNTEER_APPLICATION_KIND)).toHaveLength(1);
    expect(
      await deliveries(VOLUNTEER_APPLICATION_CONFIRMATION_KIND),
    ).toHaveLength(1);
  });

  test("honours the tenant's switch and ignores a honeypot", async () => {
    await setOrgEmailEnabled(false);
    const application = await newApplication();

    expect(
      await notifyVolunteerApplicationConfirmation(service, {
        tenantId,
        referenceCode: application.referenceCode,
        siteUrl: SITE_URL,
      }),
    ).toBe("skipped");
    // What submit_volunteer_application() hands back for a filled honeypot: a
    // freshly generated code for a row it never inserted.
    expect(
      await notifyVolunteerApplicationConfirmation(service, {
        tenantId,
        referenceCode: "VOL-NOPE",
        siteUrl: SITE_URL,
      }),
    ).toBe("skipped");
    expect(await deliveries(VOLUNTEER_APPLICATION_CONFIRMATION_KIND)).toEqual(
      [],
    );
  });

  test("stays inside its tenant when a code is looked up", async () => {
    const application = await newApplication();

    // A reference code is unique only within a tenant, so an unscoped lookup
    // would be a cross-tenant read waiting to happen.
    expect(
      await notifyVolunteerApplicationConfirmation(service, {
        tenantId: crypto.randomUUID(),
        referenceCode: application.referenceCode,
        siteUrl: SITE_URL,
      }),
    ).toBe("skipped");
    expect(await deliveries(VOLUNTEER_APPLICATION_CONFIRMATION_KIND)).toEqual(
      [],
    );
  });
});

// #1234. The third gate on a receipt, between the org-wide kill switch and a
// recipient's own opt-out -- which none of these three recipients has, holding
// no account. Off means this one receipt is off, and leaves no ledger row
// behind to make a later "on" look like a duplicate.
describe("an auto-reply the tenant switched off", () => {
  test("stops the gear request confirmation without ledgering it", async () => {
    await setAutoReply(GEAR_REQUEST_CONFIRMATION_KIND, { enabled: false });
    const request = await newGearRequest();

    expect(
      await sendGearRequestConfirmation(service, {
        requestId: request.id,
        siteUrl: SITE_URL,
      }),
    ).toBe("skipped");
    expect(await deliveries(GEAR_REQUEST_CONFIRMATION_KIND)).toEqual([]);
  });

  test("stops the volunteer application confirmation without ledgering it", async () => {
    await setAutoReply(VOLUNTEER_APPLICATION_CONFIRMATION_KIND, {
      enabled: false,
    });
    const application = await newApplication();

    expect(
      await notifyVolunteerApplicationConfirmation(service, {
        tenantId,
        referenceCode: application.referenceCode,
        siteUrl: SITE_URL,
      }),
    ).toBe("skipped");
    expect(await deliveries(VOLUNTEER_APPLICATION_CONFIRMATION_KIND)).toEqual(
      [],
    );
  });

  test("stops the event registration confirmation without ledgering it", async () => {
    await setAutoReply(EVENT_REGISTRATION_CONFIRMATION_KIND, {
      enabled: false,
    });
    const registration = await newEventRegistration();

    expect(
      await sendEventRegistrationConfirmation(service, {
        registrationId: registration.id,
        siteUrl: SITE_URL,
      }),
    ).toBe("skipped");
    expect(await deliveries(EVENT_REGISTRATION_CONFIRMATION_KIND)).toEqual([]);

    // Switching it back on still sends: nothing claimed the key while it was
    // off.
    await setAutoReply(EVENT_REGISTRATION_CONFIRMATION_KIND, {
      enabled: true,
    });
    expect(
      await sendEventRegistrationConfirmation(service, {
        registrationId: registration.id,
        siteUrl: SITE_URL,
      }),
    ).toBe("sent");
    expect(await deliveries(EVENT_REGISTRATION_CONFIRMATION_KIND)).toHaveLength(
      1,
    );
  });

  test("a rewritten slot reaches the message that goes out", async () => {
    await setAutoReply(GEAR_REQUEST_CONFIRMATION_KIND, {
      slots: {
        subject: "Held for you at {{org_name}}",
        intro: "These are yours until the end of the month:",
      },
    });
    const request = await newGearRequest();
    const sent: { subject: string; text: string }[] = [];

    expect(
      await sendGearRequestConfirmation(service, {
        requestId: request.id,
        siteUrl: SITE_URL,
        onRendered: (email) =>
          sent.push({ subject: email.subject, text: email.text }),
      }),
    ).toBe("sent");

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toStartWith("Held for you at ");
    expect(sent[0].text).toContain("yours until the end of the month");
    // The slots they did not touch are still ours, and the item list is still
    // the platform's to render.
    expect(sent[0].text).toStartWith("Hi ");
    expect(sent[0].text).toContain("pick these up in person");
  });
});
