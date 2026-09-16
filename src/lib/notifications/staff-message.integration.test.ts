// Integration coverage for the first send a person decides to make (#1203):
// the one gate it honours, the one it deliberately does not, the idempotency
// the composer's message id buys, and the history row that outlives the
// delivery ledger's reach.
//
// RESEND_API_KEY is unset here (as it is in CI), so sendEmail() logs and
// returns success without contacting a provider.
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
  createPerson,
  serviceRoleClient,
  uniqueEmail,
} from "../../../test/integration-setup";
import { EMAIL_ENABLED_SETTING_KEY } from "./kinds";
import {
  GEAR_REQUEST_RECORD_TYPE,
  STAFF_MESSAGE_KIND,
} from "@/lib/outbound-messages";

mock.module("server-only", () => ({}));
const { sendStaffMessage, staffMessageDedupeKey } =
  await import("./staff-message");

const service = serviceRoleClient();
const SITE_URL = "https://chattersnow.example";

let tenantId: string;
let senderId: string;
const personCleanups: (() => Promise<void>)[] = [];

beforeAll(async () => {
  const { data: tenant, error } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (error) throw error;
  tenantId = tenant.id as string;

  const { data: user, error: userError } = await service
    .from("people")
    .select("auth_user_id")
    .eq("email", SEEDED_USERS.admin)
    .single();
  if (userError) throw userError;
  senderId = user.auth_user_id as string;

  // The seed's own message would be counted by every assertion here. afterAll
  // puts it back, because the tenant-isolation suite needs the table to have
  // a row in tenant A.
  await service.from("outbound_messages").delete().eq("tenant_id", tenantId);
});

afterEach(async () => {
  await service.from("outbound_messages").delete().eq("tenant_id", tenantId);
  await service
    .from("notification_deliveries")
    .delete()
    .eq("kind", STAFF_MESSAGE_KIND);
  await service
    .from("app_settings")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("key", EMAIL_ENABLED_SETTING_KEY);
});

afterAll(async () => {
  for (const cleanup of personCleanups) await cleanup();
  // The seeded row the tenant-isolation suite needs back (supabase/seed.sql).
  await service.from("outbound_messages").upsert(
    {
      id: "eeeeeeee-0000-4000-8000-000000003001",
      tenant_id: tenantId,
      to_email: "priya.n@example.test",
      person_id: "bbbbbbbb-0000-4000-8000-000000000004",
      module: "inventory",
      record_type: GEAR_REQUEST_RECORD_TYPE,
      record_id: "eeeeeeee-0000-4000-8000-000000002001",
      subject: "About your gear request",
      body: "Restored by staff-message.integration.test.ts.",
      kind: STAFF_MESSAGE_KIND,
      status: "sent",
      sent_by: senderId,
    },
    { onConflict: "id" },
  );
});

async function recipient() {
  const email = uniqueEmail("staff-message");
  const person = await createPerson({ email });
  personCleanups.push(person.cleanup);
  return { personId: person.id, email };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    messageId: crypto.randomUUID(),
    tenantId,
    personId: null as string | null,
    toEmail: "",
    recipientName: "Integration Test Person",
    module: "inventory",
    recordType: GEAR_REQUEST_RECORD_TYPE,
    recordId: crypto.randomUUID(),
    subject: "About your gear request",
    body: "The blue one is gone.\n\nWould the grey do?",
    sentBy: senderId,
    fallbackOrigin: SITE_URL,
    ...overrides,
  };
}

async function messages() {
  const { data } = await service
    .from("outbound_messages")
    .select(
      "id, kind, status, subject, body, to_email, person_id, delivery_id, module",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

async function setOrgEmailEnabled(enabled: boolean) {
  const { error } = await service
    .from("app_settings")
    .upsert(
      { tenant_id: tenantId, key: EMAIL_ENABLED_SETTING_KEY, value: enabled },
      { onConflict: "tenant_id,key" },
    );
  if (error) throw error;
}

describe("sending a staff message", () => {
  test("sends, ledgers, and records what was said", async () => {
    const person = await recipient();
    const input = request({ personId: person.personId, toEmail: person.email });

    expect(await sendStaffMessage(service, input)).toBe("sent");

    const rows = await messages();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(input.messageId);
    expect(rows[0].kind).toBe(STAFF_MESSAGE_KIND);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].body).toContain("Would the grey do?");
    expect(rows[0].to_email).toBe(person.email);
    expect(rows[0].person_id).toBe(person.personId);

    // The history row points at the ledger entry the send claimed, so an
    // administrator can reach the provider's id and error text from here.
    const { data: delivery } = await service
      .from("notification_deliveries")
      .select("id, dedupe_key, status")
      .eq("kind", STAFF_MESSAGE_KIND)
      .single();
    expect(delivery!.dedupe_key).toBe(staffMessageDedupeKey(input.messageId));
    expect(rows[0].delivery_id).toBe(delivery!.id);
  });

  test("one message id sends one email, however many times it is used", async () => {
    const person = await recipient();
    const input = request({ personId: person.personId, toEmail: person.email });

    expect(await sendStaffMessage(service, input)).toBe("sent");
    // What a double-click or a retried Server Action does.
    expect(await sendStaffMessage(service, input)).toBe("skipped");

    expect(await messages()).toHaveLength(1);
    const { count } = await service
      .from("notification_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("kind", STAFF_MESSAGE_KIND);
    expect(count).toBe(1);
  });

  test("a recipient who turned every notification off still hears from staff", async () => {
    const person = await recipient();
    // Every registered kind switched off, which is as far as a person can go.
    for (const kind of [
      "gear_request_confirmation",
      "event_registration_confirmation",
      "volunteer_application_confirmation",
    ]) {
      await service.from("person_notification_preferences").upsert(
        {
          tenant_id: tenantId,
          person_id: person.personId,
          kind,
          enabled: false,
        },
        { onConflict: "tenant_id,person_id,kind" },
      );
    }

    // staff_message is not a registered kind, so there is no row that could
    // suppress it -- a reply about a request you made is correspondence.
    expect(
      await sendStaffMessage(
        service,
        request({ personId: person.personId, toEmail: person.email }),
      ),
    ).toBe("sent");
    expect(await messages()).toHaveLength(1);

    await service
      .from("person_notification_preferences")
      .delete()
      .eq("person_id", person.personId);
  });

  test("the organization's kill switch stops it, and writes no history", async () => {
    await setOrgEmailEnabled(false);
    const person = await recipient();

    expect(
      await sendStaffMessage(
        service,
        request({ personId: person.personId, toEmail: person.email }),
      ),
    ).toBe("skipped");
    expect(await messages()).toEqual([]);
  });

  test("writes a row for a recipient with no people row of their own", async () => {
    // #1204's contact messages: an address and a name, and nothing in people.
    const input = request({
      personId: null,
      toEmail: uniqueEmail("no-person"),
      module: "communications",
      recordType: "contact_message",
    });

    expect(await sendStaffMessage(service, input)).toBe("sent");
    const rows = await messages();
    expect(rows).toHaveLength(1);
    expect(rows[0].person_id).toBeNull();
    expect(rows[0].module).toBe("communications");
  });
});

describe("the body never reaches the audit log", () => {
  test("the trail says a message went out, and not what it said", async () => {
    const person = await recipient();
    const input = request({ personId: person.personId, toEmail: person.email });
    await sendStaffMessage(service, input);

    const { data } = await service
      .from("audit_log")
      .select("action, new_data")
      .eq("table_name", "outbound_messages")
      .eq("record_id", input.messageId)
      .single();

    expect(data!.action).toBe("insert");
    const newData = data!.new_data as Record<string, unknown>;
    // Registered in audited_tables.redacted_columns, so the trigger strips
    // them before the row is written: audit_log is kept indefinitely and this
    // table is on a two-year clock.
    expect(newData.subject).toBeUndefined();
    expect(newData.body).toBeUndefined();
    expect(newData.to_email).toBeUndefined();
    // What it does keep is enough to answer "was anything sent about this?".
    expect(newData.record_id).toBe(input.recordId);
    expect(newData.status).toBe("sent");
  });
});
