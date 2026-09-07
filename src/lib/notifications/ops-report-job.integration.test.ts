// Integration coverage for the daily leadership ops report (#743) against a
// real local Supabase stack: the gates that decide whether anything is sent,
// the ledger that stops it being sent twice, and the tenant scoping that keeps
// one organization's operating picture out of another's inbox.
//
// The scoping cases matter more here than almost anywhere else: runOpsReport
// uses the service-role client, which bypasses RLS entirely, so every
// tenant_id in ops-report-job.ts is load-bearing and there is no policy
// underneath to catch a mistake.
//
// RESEND_API_KEY is unset here (as it is in CI), so sendEmail() logs and
// returns success without contacting a provider -- the whole path runs with no
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
  adminClient,
  serviceRoleClient,
} from "../../../test/integration-setup";
import { EMAIL_ENABLED_SETTING_KEY } from "./kinds";
import {
  OPS_REPORT_KIND,
  OPS_REPORT_RECIPIENTS_SETTING_KEY,
} from "./ops-report";

// ops-report-job.ts and the send helper both import "server-only", which
// throws outside Next's bundler.
mock.module("server-only", () => ({}));
const { runOpsReport } = await import("./ops-report-job");

const service = serviceRoleClient();
const SITE_URL = "https://chattersnow.example";
const RECIPIENT = "leadership@example.test";
const NOW = new Date("2026-03-14T13:00:00Z");

let tenantId: string;
let messageIds: string[] = [];

/** Something to report, so a run is not skipped for being empty. */
async function seedSomethingToReport(): Promise<void> {
  const { data, error } = await service
    .from("contact_messages")
    .insert({
      tenant_id: tenantId,
      name: "Integration",
      email: "writer@example.test",
      topic: "general",
      message: "Anything at all",
      // Inside the 24-hour first-run window ending at NOW.
      created_at: new Date(NOW.getTime() - 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  messageIds.push(data.id as string);
}

async function setRecipients(value: unknown): Promise<void> {
  const { error } = await service
    .from("app_settings")
    .upsert(
      { tenant_id: tenantId, key: OPS_REPORT_RECIPIENTS_SETTING_KEY, value },
      { onConflict: "tenant_id,key" },
    );
  if (error) throw error;
}

async function opsReportRows() {
  const { data, error } = await service
    .from("notification_deliveries")
    .select("id, tenant_id, person_id, dedupe_key, status")
    .eq("kind", OPS_REPORT_KIND);
  if (error) throw error;
  return data ?? [];
}

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
  // Only this file's rows: supabase/seed.sql leaves a delivery behind for the
  // admin's person and the tenant-isolation suite asserts the table is not
  // empty. Nothing seeded uses the ops_report kind.
  await service
    .from("notification_deliveries")
    .delete()
    .eq("kind", OPS_REPORT_KIND);
  if (messageIds.length > 0) {
    await service.from("contact_messages").delete().in("id", messageIds);
    messageIds = [];
  }
  await service
    .from("app_settings")
    .delete()
    .eq("tenant_id", tenantId)
    .in("key", [OPS_REPORT_RECIPIENTS_SETTING_KEY, EMAIL_ENABLED_SETTING_KEY]);
});

afterAll(async () => {
  await service
    .from("notification_deliveries")
    .delete()
    .eq("kind", OPS_REPORT_KIND);
});

describe("runOpsReport gates", () => {
  test("a tenant with no configured recipients gets nothing", async () => {
    await seedSomethingToReport();

    const summary = await runOpsReport(service, {
      now: NOW,
      siteUrl: SITE_URL,
    });

    expect(summary.tenants).toBe(0);
    expect(summary.sent).toBe(0);
    expect(await opsReportRows()).toHaveLength(0);
  });

  test("a recipients value that holds no usable address is the same as none", async () => {
    await seedSomethingToReport();
    await setRecipients(["not-an-address", "   "]);

    const summary = await runOpsReport(service, {
      now: NOW,
      siteUrl: SITE_URL,
    });

    expect(summary.tenants).toBe(0);
    expect(await opsReportRows()).toHaveLength(0);
  });

  test("the org kill switch stops the report", async () => {
    await seedSomethingToReport();
    await setRecipients([RECIPIENT]);
    const { error } = await service
      .from("app_settings")
      .upsert(
        { tenant_id: tenantId, key: EMAIL_ENABLED_SETTING_KEY, value: false },
        { onConflict: "tenant_id,key" },
      );
    if (error) throw error;

    const summary = await runOpsReport(service, {
      now: NOW,
      siteUrl: SITE_URL,
    });

    expect(summary.considered).toBe(1);
    expect(summary.sent).toBe(0);
    expect(summary.skipped).toBe(1);
    // Nothing is claimed either: a muted tenant must leave no trace that would
    // make tomorrow's run think today's report went out.
    expect(await opsReportRows()).toHaveLength(0);
  });

  // "A quiet day sends nothing rather than an empty report" is asserted in
  // ops-report.test.ts instead. It cannot be asserted here: supabase/seed.sql
  // leaves submitted expenses and reimbursements standing so the approval
  // queues have something in them, and those are not time-windowed -- against
  // the seeded database there is no such thing as a quiet day, and emptying
  // the queues to manufacture one would break every other file that reads
  // them.
});

describe("runOpsReport delivery", () => {
  test("sends one organization-addressed report per recipient", async () => {
    await seedSomethingToReport();
    await setRecipients([RECIPIENT, "board@example.test"]);

    const summary = await runOpsReport(service, {
      now: NOW,
      siteUrl: SITE_URL,
    });

    expect(summary.tenants).toBe(1);
    expect(summary.considered).toBe(2);
    expect(summary.sent).toBe(2);
    expect(summary.failed).toBe(0);

    const rows = await opsReportRows();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.tenant_id).toBe(tenantId);
      // Addressed to the organization, not to anyone in `people`.
      expect(row.person_id).toBeNull();
      expect(row.status).toBe("sent");
    }
    expect(rows.map((row) => row.dedupe_key).sort()).toEqual([
      "ops-report:2026-03-14:board@example.test",
      `ops-report:2026-03-14:${RECIPIENT}`,
    ]);
  });

  test("re-running the same day does not re-send", async () => {
    await seedSomethingToReport();
    await setRecipients([RECIPIENT]);

    const first = await runOpsReport(service, { now: NOW, siteUrl: SITE_URL });
    const second = await runOpsReport(service, { now: NOW, siteUrl: SITE_URL });

    expect(first.sent).toBe(1);
    // The second run loses the race on the partial unique index added in
    // 20260907120000 -- which is the only thing standing between a scheduler
    // that fires twice and two copies of the same report.
    expect(second.sent).toBe(0);
    expect(second.skipped).toBe(1);
    expect(await opsReportRows()).toHaveLength(1);
  });

  test("the next day is a new report", async () => {
    await seedSomethingToReport();
    await setRecipients([RECIPIENT]);

    await runOpsReport(service, { now: NOW, siteUrl: SITE_URL });
    // A day later, with something new inside the window that now starts at the
    // first run's ledger row.
    const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const { data, error } = await service
      .from("contact_messages")
      .insert({
        tenant_id: tenantId,
        name: "Integration",
        email: "writer@example.test",
        topic: "general",
        message: "Something newer",
      })
      .select("id")
      .single();
    if (error) throw error;
    messageIds.push(data.id as string);

    const second = await runOpsReport(service, {
      now: tomorrow,
      siteUrl: SITE_URL,
    });

    expect(second.sent).toBe(1);
    expect((await opsReportRows()).map((row) => row.dedupe_key).sort()).toEqual(
      [
        `ops-report:2026-03-14:${RECIPIENT}`,
        `ops-report:2026-03-15:${RECIPIENT}`,
      ],
    );
  });
});

describe("app_settings scoping", () => {
  test("the recipient list is readable only by an administrator", async () => {
    await setRecipients([RECIPIENT]);

    // The panel that edits this runs as a signed-in administrator, which is
    // the only session app_settings' own select policy admits; this asserts
    // the address is not sitting in a table any signed-in user can read.
    const { data, error } = await adminClient
      .from("app_settings")
      .select("value")
      .eq("key", OPS_REPORT_RECIPIENTS_SETTING_KEY)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.value).toEqual([RECIPIENT]);
  });
});
