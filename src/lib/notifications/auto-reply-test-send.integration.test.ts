// Integration coverage for the "send yourself a test" half of #1236: where it
// goes, that it always goes, and -- the one that matters -- that it can never
// stand in the way of a real receipt.
//
// RESEND_API_KEY is unset here (as it is in CI), so sendEmail() logs and
// returns success without contacting a provider. That leaves the ledger as the
// record of what happened, which is exactly what these assertions read.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import {
  createPerson,
  serviceRoleClient,
  uniqueEmail,
} from "../../../test/integration-setup";
import {
  EMAIL_ENABLED_SETTING_KEY,
  EVENT_REGISTRATION_CONFIRMATION_KIND,
} from "./kinds";
import { autoReplyDefaults, autoReplyDefinition } from "./auto-replies";
import type { TenantMailContext } from "@/lib/email/identity";

mock.module("server-only", () => ({}));
const { AUTO_REPLY_TEST_KIND, sendAutoReplyTest } =
  await import("./auto-reply-test-send");
const { deliverEmail } = await import("./deliver");

const service = serviceRoleClient();

const MAIL: TenantMailContext = {
  identity: {
    from: '"Riverside Community Center" <notifications@example.org>',
  },
  origin: "https://chattersnow.example",
  displayName: "Riverside Community Center",
  branding: {
    logoUrl: "https://cdn.example.org/riverside.png",
    primary: "#0f766e",
    primaryDeep: "#134e4a",
  },
};

let tenantId: string;
const personCleanups: (() => Promise<void>)[] = [];

beforeAll(async () => {
  const { data, error } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (error) throw error;
  tenantId = data.id as string;
});

afterEach(async () => {
  await service
    .from("notification_deliveries")
    .delete()
    .in("kind", [AUTO_REPLY_TEST_KIND, EVENT_REGISTRATION_CONFIRMATION_KIND]);
  await service
    .from("app_settings")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("key", EMAIL_ENABLED_SETTING_KEY);
  for (const cleanup of personCleanups.splice(0)) await cleanup();
});

async function administrator() {
  const email = uniqueEmail("auto-reply-test");
  const person = await createPerson({ email });
  personCleanups.push(person.cleanup);
  return { personId: person.id, email };
}

function request(personId: string, toEmail: string) {
  return {
    tenantId,
    personId,
    toEmail,
    kind: EVENT_REGISTRATION_CONFIRMATION_KIND,
    copy: autoReplyDefaults(
      autoReplyDefinition(EVENT_REGISTRATION_CONFIRMATION_KIND)!,
    ),
    mail: MAIL,
    timeZone: "America/Denver",
  };
}

async function ledger(kind: string) {
  const { data } = await service
    .from("notification_deliveries")
    .select("kind, dedupe_key, person_id, status")
    .eq("tenant_id", tenantId)
    .eq("kind", kind);
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

describe("sending yourself a test", () => {
  test("goes out, and is ledgered under a kind of its own", async () => {
    const person = await administrator();

    expect(
      await sendAutoReplyTest(service, request(person.personId, person.email)),
    ).toBe("sent");

    // Under `auto_reply_test`, never under the reply's own kind: the unique
    // constraint is (tenant, person, kind, dedupe_key), so this is what makes
    // a collision with a real receipt impossible rather than merely unlikely.
    expect(await ledger(EVENT_REGISTRATION_CONFIRMATION_KIND)).toHaveLength(0);
    const rows = await ledger(AUTO_REPLY_TEST_KIND);
    expect(rows).toHaveLength(1);
    expect(rows[0].person_id).toBe(person.personId);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].dedupe_key).toStartWith(
      `${EVENT_REGISTRATION_CONFIRMATION_KIND}:`,
    );
  });

  test("a second test after an edit arrives too", async () => {
    const person = await administrator();
    const input = request(person.personId, person.email);

    expect(await sendAutoReplyTest(service, input)).toBe("sent");
    // The thing a fixed dedupe key would have broken: pressing the button
    // again after changing a word has to produce a second email.
    expect(await sendAutoReplyTest(service, input)).toBe("sent");

    expect(await ledger(AUTO_REPLY_TEST_KIND)).toHaveLength(2);
  });

  test("never suppresses the real receipt it is a test of", async () => {
    const person = await administrator();
    await sendAutoReplyTest(service, request(person.personId, person.email));

    // The same person, the same reply kind, the way the public registration
    // path would claim it. It must be unaffected by the test that came first.
    const outcome = await deliverEmail(service, {
      tenantId,
      personId: person.personId,
      identity: MAIL.identity,
      kind: EVENT_REGISTRATION_CONFIRMATION_KIND,
      dedupeKey: "registration-00000000-0000-4000-8000-000000000001",
      to: person.email,
      render: () => ({
        subject: "You're registered",
        text: "You're registered.",
        html: "<p>You're registered.</p>",
      }),
      logPrefix: "[test]",
    });

    expect(outcome).toBe("sent");
    expect(await ledger(EVENT_REGISTRATION_CONFIRMATION_KIND)).toHaveLength(1);
  });

  test("the organization's kill switch stops it", async () => {
    const person = await administrator();
    await setOrgEmailEnabled(false);

    // A switched-off organization must not be able to spend the shared daily
    // sending allowance on tests either.
    expect(
      await sendAutoReplyTest(service, request(person.personId, person.email)),
    ).toBe("skipped");
    expect(await ledger(AUTO_REPLY_TEST_KIND)).toHaveLength(0);
  });

  test("an opt-out of the receipt does not silence the test you asked for", async () => {
    const person = await administrator();
    await service.from("person_notification_preferences").upsert(
      {
        tenant_id: tenantId,
        person_id: person.personId,
        kind: EVENT_REGISTRATION_CONFIRMATION_KIND,
        enabled: false,
      },
      { onConflict: "tenant_id,person_id,kind" },
    );

    // The preference governs receipts somebody else's form triggers. This one
    // is a button the reader pressed themselves a second ago.
    expect(
      await sendAutoReplyTest(service, request(person.personId, person.email)),
    ).toBe("sent");
  });

  test("a reply with no sample says so instead of sending something empty", async () => {
    const person = await administrator();

    expect(
      await sendAutoReplyTest(service, {
        ...request(person.personId, person.email),
        kind: "not_a_reply",
      }),
    ).toBe("no-sample");
    expect(await ledger(AUTO_REPLY_TEST_KIND)).toHaveLength(0);
  });
});
