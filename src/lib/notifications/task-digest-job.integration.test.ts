// Integration coverage for the daily task digest run (#488) against a real
// local Supabase stack: the two gates that decide whether anything is sent,
// and the ledger that stops it being sent twice.
//
// RESEND_API_KEY is unset here (as it is in CI), so sendEmail() logs and
// returns success without contacting a provider -- which is the point: the
// query, both gates and every ledger write are exercised end to end with no
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
  adminClient,
  serviceRoleClient,
  signInAs,
} from "../../../test/integration-setup";

// task-digest-job.ts and the send helper both import "server-only", which
// throws outside Next's bundler.
mock.module("server-only", () => ({}));

/**
 * Captures what would have gone to the provider, so a test can read the links
 * the digest actually built (#860). Behaviourally the same as the unset-key
 * path this file otherwise runs on -- sendEmail() returns success without
 * contacting anyone either way -- so every other test here is unaffected.
 */
const sent: { to: string; from: string; html: string; text: string }[] = [];
mock.module("@/lib/email/send", () => ({
  sendEmail: async (message: {
    to: string;
    from: string;
    html: string;
    text: string;
  }) => {
    sent.push(message);
    return { ok: true, id: null };
  },
}));

const { runTaskDigest, TASK_DIGEST_KIND } = await import("./task-digest-job");

const service = serviceRoleClient();
const SITE_URL = "https://chattersnow.example";

// A Wednesday, so undated items are out of scope unless a case says otherwise.
const WEDNESDAY = new Date("2026-03-11T19:00:00Z");
const DUE_SOON = "2026-03-12";

let tenantId: string;
let personId: string;
/**
 * supabase/seed.sql opts the admin's own person in and records one delivery
 * for them, so both tables are non-empty before this file runs. Every read
 * here filters that person out rather than deleting the rows -- the
 * tenant-isolation suite asserts they exist.
 */
let seededPersonId: string;
let meetingId: string;
let itemIds: string[] = [];

beforeAll(async () => {
  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (tenantError) throw tenantError;
  tenantId = tenant.id as string;

  // The seeded volunteer, given a people row the way /portal/account does.
  // A recipient needs an email *and* an auth_user_id, and this is what makes
  // the account satisfy both.
  const { data: seeded, error: seededError } = await service
    .from("people")
    .select("id")
    .eq("email", "admin@example.test")
    .single();
  if (seededError) throw seededError;
  seededPersonId = seeded.id as string;

  const volunteer = await signInAs(SEEDED_USERS.volunteer);
  const { data: ensured, error: ensureError } = await volunteer.rpc(
    "ensure_current_person",
  );
  if (ensureError) throw ensureError;
  personId = (ensured as { person_id: string }[])[0].person_id;

  const { data: meeting, error: meetingError } = await adminClient
    .from("governance_meetings")
    .insert({
      meeting_date: "2026-03-01T18:00:00Z",
      meeting_type: "board",
      status: "completed",
    })
    .select("id")
    .single();
  if (meetingError) throw meetingError;
  meetingId = meeting.id as string;

  const { data: items, error: itemsError } = await adminClient
    .from("governance_meeting_action_items")
    .insert([
      {
        meeting_id: meetingId,
        description: "Send the insurance certificate",
        owner_person_id: personId,
        due_date: DUE_SOON,
        status: "open",
      },
      {
        meeting_id: meetingId,
        description: "Something that is already handled",
        owner_person_id: personId,
        due_date: DUE_SOON,
        status: "done",
      },
    ])
    .select("id");
  if (itemsError) throw itemsError;
  itemIds = items!.map((row) => row.id as string);
});

afterEach(async () => {
  // Scoped to this file's person: supabase/seed.sql leaves a preference and a
  // delivery for the admin's person, and the tenant-isolation suite asserts
  // both tables are non-empty.
  await service
    .from("notification_deliveries")
    .delete()
    .eq("person_id", personId);
  await service
    .from("person_notification_preferences")
    .delete()
    .eq("person_id", personId);
  await service
    .from("app_settings")
    .delete()
    .eq("key", "notifications.email_enabled");
});

afterAll(async () => {
  await service
    .from("governance_meeting_action_items")
    .delete()
    .in("id", itemIds);
  await service.from("governance_meetings").delete().eq("id", meetingId);
  // Same reason as preferences.integration.test.ts: volunteer@ is seeded
  // without a people row on purpose, and ensure_current_person() gave it one.
  await service.from("people").delete().eq("id", personId);
});

async function optIn(enabled: boolean) {
  const { error } = await service
    .from("person_notification_preferences")
    .insert({
      tenant_id: tenantId,
      person_id: personId,
      kind: TASK_DIGEST_KIND,
      enabled,
    });
  if (error) throw error;
}

async function setOrgSwitch(enabled: boolean) {
  const { error } = await service.from("app_settings").insert({
    tenant_id: tenantId,
    key: "notifications.email_enabled",
    value: enabled,
  });
  if (error) throw error;
}

async function deliveries() {
  const { data, error } = await service
    .from("notification_deliveries")
    .select("tenant_id, person_id, kind, dedupe_key, status, sent_at")
    .neq("person_id", seededPersonId);
  if (error) throw error;
  return data!;
}

describe("runTaskDigest gates", () => {
  test("sends nothing to someone who has not opted in", async () => {
    // The default. `people` is a directory full of donors, sponsors and
    // organizations created by public intake, and none of them asked for mail.
    const summary = await runTaskDigest(service, {
      now: WEDNESDAY,
      siteUrl: SITE_URL,
    });

    expect(summary.sent).toBe(0);
    expect(summary.considered).toBeGreaterThan(0);
    expect(await deliveries()).toEqual([]);
  });

  test("sends nothing to someone who has opted out", async () => {
    await optIn(false);

    const summary = await runTaskDigest(service, {
      now: WEDNESDAY,
      siteUrl: SITE_URL,
    });

    expect(summary.sent).toBe(0);
    expect(await deliveries()).toEqual([]);
  });

  test("sends nothing at all when the organization switch is off", async () => {
    await optIn(true);
    await setOrgSwitch(false);

    const summary = await runTaskDigest(service, {
      now: WEDNESDAY,
      siteUrl: SITE_URL,
    });

    expect(summary.sent).toBe(0);
    expect(summary.skipped).toBeGreaterThan(0);
    expect(await deliveries()).toEqual([]);
  });

  test("sends when the organization switch is on and the person opted in", async () => {
    await optIn(true);
    await setOrgSwitch(true);

    const summary = await runTaskDigest(service, {
      now: WEDNESDAY,
      siteUrl: SITE_URL,
    });

    expect(summary.sent).toBe(1);
    expect(summary.failed).toBe(0);

    const rows = await deliveries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenant_id: tenantId,
      person_id: personId,
      kind: TASK_DIGEST_KIND,
      dedupe_key: "task-digest:2026-03-11",
      status: "sent",
    });
    expect(rows[0].sent_at).not.toBeNull();
  });

  test("sends with no app_settings row at all", async () => {
    // An unset switch means on: it is a stop an administrator reaches for, and
    // the per-person opt-in is what actually decides delivery.
    await optIn(true);

    const summary = await runTaskDigest(service, {
      now: WEDNESDAY,
      siteUrl: SITE_URL,
    });

    expect(summary.sent).toBe(1);
  });
});

describe("runTaskDigest idempotency", () => {
  test("a second run on the same day sends nothing further", async () => {
    await optIn(true);

    const first = await runTaskDigest(service, {
      now: WEDNESDAY,
      siteUrl: SITE_URL,
    });
    const second = await runTaskDigest(service, {
      now: WEDNESDAY,
      siteUrl: SITE_URL,
    });

    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);
    expect(second.skipped).toBe(1);
    expect(await deliveries()).toHaveLength(1);
  });

  test("concurrent runs produce exactly one delivery", async () => {
    // The real race: two invocations of the same cron, which is what #585's
    // shared vercel.json will eventually cause. Both claim, one wins the
    // unique constraint, and only the winner sends.
    await optIn(true);

    const [a, b] = await Promise.all([
      runTaskDigest(service, { now: WEDNESDAY, siteUrl: SITE_URL }),
      runTaskDigest(service, { now: WEDNESDAY, siteUrl: SITE_URL }),
    ]);

    expect(a.sent + b.sent).toBe(1);
    expect(await deliveries()).toHaveLength(1);
  });

  test("the next day is a new send", async () => {
    await optIn(true);

    await runTaskDigest(service, { now: WEDNESDAY, siteUrl: SITE_URL });
    const nextDay = await runTaskDigest(service, {
      now: new Date("2026-03-12T19:00:00Z"),
      siteUrl: SITE_URL,
    });

    expect(nextDay.sent).toBe(1);
    const rows = await deliveries();
    expect(rows.map((row) => row.dedupe_key).sort()).toEqual([
      "task-digest:2026-03-11",
      "task-digest:2026-03-12",
    ]);
  });
});

describe("runTaskDigest scope", () => {
  test("ignores an item that is already done, and one outside the window", async () => {
    await optIn(true);

    const { data: far, error } = await adminClient
      .from("governance_meeting_action_items")
      .insert({
        meeting_id: meetingId,
        description: "Not due for months",
        owner_person_id: personId,
        due_date: "2026-09-01",
        status: "open",
      })
      .select("id")
      .single();
    if (error) throw error;
    itemIds.push(far.id as string);

    // One recipient either way -- the assertion that matters is that the
    // digest exists because of the one qualifying item, not the other two.
    const summary = await runTaskDigest(service, {
      now: WEDNESDAY,
      siteUrl: SITE_URL,
    });
    expect(summary.sent).toBe(1);

    const later = await runTaskDigest(service, {
      // A day on which nothing of this person's qualifies: the near item is
      // long past, the far one is still out of range on the far side.
      now: new Date("2026-06-01T19:00:00Z"),
      siteUrl: SITE_URL,
    });
    expect(later.considered).toBe(1); // the overdue near item still counts
    expect(later.sent).toBe(1);
  });

  test("sends nothing to a person with no portal account", async () => {
    await optIn(true);

    // An email but no auth_user_id -- a donor or sponsor row, of which
    // `people` is mostly made. The digest is a set of portal deep links, so
    // it would be meaningless to them.
    const { data: noLogin, error: personError } = await service
      .from("people")
      .insert({
        tenant_id: tenantId,
        name: "No Login Person",
        source_type: "individual",
        email: `it-nologin-${crypto.randomUUID()}@example.test`,
      })
      .select("id")
      .single();
    if (personError) throw personError;
    const noLoginId = noLogin.id as string;

    const { data: item, error } = await adminClient
      .from("governance_meeting_action_items")
      .insert({
        meeting_id: meetingId,
        description: "Assigned to someone with no login",
        owner_person_id: noLoginId,
        due_date: DUE_SOON,
        status: "open",
      })
      .select("id")
      .single();
    if (error) throw error;

    const summary = await runTaskDigest(service, {
      now: WEDNESDAY,
      siteUrl: SITE_URL,
    });

    const rows = await deliveries();
    expect(rows.every((row) => row.person_id !== noLoginId)).toBe(true);
    expect(summary.sent).toBe(1);

    await service
      .from("governance_meeting_action_items")
      .delete()
      .eq("id", item.id as string);
    await service.from("people").delete().eq("id", noLoginId);
  }, 20000);
});

describe("runTaskDigest link origin", () => {
  /**
   * The bug this covers (#860): the origin used to come from the one
   * NEXT_PUBLIC_SITE_URL handed to a job that walks every tenant, so a member
   * of the second tenant got a digest whose links pointed at the first
   * tenant's domain -- at best a 404, at worst an invitation to sign in
   * somewhere that is not their organization.
   *
   * Provable with one tenant, and better so: no second tenant is provisioned
   * here, because an extra active tenant changes host resolution for anything
   * running beside this (#795). What has to hold is that the origin comes from
   * the tenant row rather than from the argument, and that is exactly what a
   * custom_domain differing from SITE_URL shows.
   */
  const TENANT_DOMAIN = "digest-origin-test.example";

  async function setCustomDomain(domain: string | null) {
    const { error } = await service
      .from("tenants")
      .update({ custom_domain: domain })
      .eq("id", tenantId);
    if (error) throw error;
  }

  afterEach(async () => {
    await setCustomDomain(null);
    sent.length = 0;
  });

  test("links a tenant's recipients to that tenant's own site", async () => {
    await optIn(true);
    await setCustomDomain(TENANT_DOMAIN);

    const summary = await runTaskDigest(service, {
      now: WEDNESDAY,
      siteUrl: SITE_URL,
    });
    expect(summary.sent).toBe(1);

    const digest = sent.at(-1)!;
    expect(digest.html).toContain(`https://${TENANT_DOMAIN}/portal/`);
    // The whole point: the origin the job was handed does not reach the links.
    expect(digest.html).not.toContain(SITE_URL);
    expect(digest.text).not.toContain(SITE_URL);
  });

  test("falls back to the platform origin for a tenant with no domain", async () => {
    await optIn(true);
    await setCustomDomain(null);

    const summary = await runTaskDigest(service, {
      now: WEDNESDAY,
      siteUrl: SITE_URL,
    });
    expect(summary.sent).toBe(1);

    expect(sent.at(-1)!.html).toContain(`${SITE_URL}/portal/`);
  });
});
