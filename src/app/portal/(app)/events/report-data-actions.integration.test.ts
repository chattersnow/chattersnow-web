// Integration test: exercises get_event_report_data (20261011140000) against a
// real local Supabase stack (#1576).
//
// The RPC is security definer and gates each section on its own permission,
// so only a real stack with real policies and real module entitlements can
// show that the board role gets the money figures and nothing else, that a
// tenant without Finance gets no Money section at all, and that the event's
// net agrees with Finance > Financial Reports.
//
// Submitting freezes the figures (#1579): the snapshot is written by
// submit_event_report whatever the submitter may see, read back under the
// same per-section checks, and cleared by reopening.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createMonetaryDonation,
  createPublishedEvent,
  seededTenantId,
  serviceRoleClient,
  signInAs,
  tenantToday,
  withModule,
} from "../../../../../test/integration-setup";
import {
  summarizeByEvent,
  type FinanceReportData,
} from "../finance/reports/summary";
import { eventReportDrift } from "@/lib/portal/event-report-metrics";

mock.module("next/cache", () => ({ revalidatePath: () => {} }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { getEventReportAction } = await import("./report-data-actions");
const { reopenEventReportAction, submitEventReportAction } =
  await import("./actions");

const service = serviceRoleClient();
let tenantId: string;
let event: Awaited<ReturnType<typeof createPublishedEvent>>;
let donation: Awaited<ReturnType<typeof createMonetaryDonation>>;

beforeAll(async () => {
  tenantId = await seededTenantId();
  event = await createPublishedEvent();
  const { data: user } = await adminClient.auth.getUser();
  const adminId = user.user!.id;

  const revenue = await adminClient.from("event_revenue").insert({
    event_id: event.id,
    source: "ticket_sales",
    amount: 300,
    received_date: tenantToday(),
  });
  if (revenue.error) throw revenue.error;

  // Straight in as paid and approved: the workflow is not under test here.
  const expenses = await service.from("event_expenses").insert([
    {
      event_id: event.id,
      description: "Report test: paid",
      expense_date: tenantToday(),
      amount: 120,
      currency: "USD",
      created_by: adminId,
      submitted_by: adminId,
      status: "paid",
    },
    {
      event_id: event.id,
      description: "Report test: approved",
      expense_date: tenantToday(),
      amount: 45,
      currency: "USD",
      created_by: adminId,
      submitted_by: adminId,
      status: "approved",
    },
  ]);
  if (expenses.error) throw expenses.error;

  donation = await createMonetaryDonation({ eventId: event.id, amount: 50 });

  const incident = await adminClient.from("event_incidents").insert({
    event_id: event.id,
    description: "Report test: twisted ankle",
    severity: "moderate",
  });
  if (incident.error) throw incident.error;
});

afterAll(async () => {
  await adminClient.from("event_incidents").delete().eq("event_id", event.id);
  await service.from("event_expenses").delete().eq("event_id", event.id);
  await adminClient.from("event_revenue").delete().eq("event_id", event.id);
  await donation.cleanup();
  await event.cleanup();
});

async function viewAs(email: string) {
  currentSupabase = await signInAs(email);
  const result = await getEventReportAction(event.id);
  if ("error" in result) throw new Error(result.error);
  return result.data;
}

async function reportAs(email: string) {
  return (await viewAs(email)).live;
}

describe("get_event_report_data (integration)", () => {
  test("admin sees every section, with paid spend only in the net", async () => {
    const report = await reportAs(SEEDED_USERS.admin);

    expect(report.money?.income).toBe(350);
    expect(report.money?.paidSpend).toBe(120);
    expect(report.money?.committedSpend).toBe(45);
    expect(report.money?.net).toBe(230);
    expect(report.goods).not.toBeNull();
    expect(report.sponsors).toEqual(
      expect.objectContaining({ count: 0, followUpOutstanding: 0 }),
    );
    expect(report.team).not.toBeNull();
    expect(report.operations?.bySeverity.moderate).toBe(1);
  });

  test("the event's net agrees with Finance > Financial Reports", async () => {
    const report = await reportAs(SEEDED_USERS.admin);
    const { data, error } = await currentSupabase.rpc(
      "get_finance_report_data",
      { p_from: tenantToday(), p_to: tenantToday() },
    );
    if (error) throw error;
    const finance = data as unknown as FinanceReportData;
    const row = summarizeByEvent(
      finance.revenue,
      [...finance.expenses, ...finance.reimbursements],
      finance.monetary_donations,
      finance.sales,
      finance.giveaway_ticket_sales,
    ).find((entry) => entry.eventId === event.id);

    expect(row?.income).toBe(report.money!.income);
    expect(row?.net).toBe(report.money!.net);
  });

  // finance_reports:view, events:none: the money figures, and nothing that
  // would need the event's own records.
  test("board sees Money, and no section that needs events access", async () => {
    const asAdmin = await reportAs(SEEDED_USERS.admin);
    const report = await reportAs(SEEDED_USERS.board);

    expect(report.money).toEqual(asAdmin.money);
    expect(report.sponsors).toBeNull();
    expect(report.team).toBeNull();
    expect(report.operations).toBeNull();
  });

  test("a tenant without Finance gets no Money section", async () => {
    await withModule(tenantId, "finance", false, async () => {
      const report = await reportAs(SEEDED_USERS.admin);
      expect(report.money).toBeNull();
      expect(report.operations?.incidents).toBe(1);
    });
  });

  test("a role with no events, impact or finance report access is refused", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);
    const result = await getEventReportAction(event.id);
    expect(result).toEqual({
      error: "Could not load the event report. Please try again.",
    });
  });
});

describe("report_snapshot (integration)", () => {
  let adminId: string;

  beforeAll(async () => {
    const { data: user } = await adminClient.auth.getUser();
    adminId = user.user!.id;
  });

  test("an unsubmitted report has no snapshot", async () => {
    expect((await viewAs(SEEDED_USERS.admin)).snapshot).toBeNull();
  });

  // events:manage without finance_reports:view: the snapshot is still
  // complete, because the RPC writes it rather than the submitter's session.
  test("submitting freezes every section, even those the submitter cannot see", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    expect(await submitEventReportAction(event.id)).toEqual({ success: true });

    const view = await viewAs(SEEDED_USERS.admin);
    expect(view.snapshot?.capturedAt).toBeTruthy();
    expect(view.snapshot?.report).toEqual(view.live);
    expect(view.snapshot?.report.money?.net).toBe(230);
  });

  test("a later change shows as drift while the snapshot holds", async () => {
    const late = await service.from("event_expenses").insert({
      event_id: event.id,
      description: "Report test: paid after submission",
      expense_date: tenantToday(),
      amount: 30,
      currency: "USD",
      created_by: adminId,
      submitted_by: adminId,
      status: "paid",
    });
    if (late.error) throw late.error;

    const view = await viewAs(SEEDED_USERS.admin);
    expect(view.snapshot?.report.money?.net).toBe(230);
    expect(view.live.money?.net).toBe(200);
    expect(
      eventReportDrift(view.snapshot!.report, view.live).get("money.net"),
    ).toEqual({ atSubmission: 230, now: 200 });
  });

  test("board reads the frozen Money and no frozen events section", async () => {
    const { snapshot } = await viewAs(SEEDED_USERS.board);
    expect(snapshot?.report.money?.net).toBe(230);
    expect(snapshot?.report.sponsors).toBeNull();
    expect(snapshot?.report.team).toBeNull();
    expect(snapshot?.report.operations).toBeNull();
  });

  test("the snapshot cannot be written directly", async () => {
    const { error } = await adminClient
      .from("events")
      .update({ report_snapshot: { money: null } })
      .eq("id", event.id);
    expect(error?.message).toContain(
      "The report snapshot is written only by submitting or reopening the report",
    );
  });

  test("reopening clears the snapshot", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    expect(
      await reopenEventReportAction(event.id, "Report test: late expense"),
    ).toEqual({ success: true });
    expect((await viewAs(SEEDED_USERS.admin)).snapshot).toBeNull();
  });
});
