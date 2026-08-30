// Integration test: exercises getOrganizationSummary (the dashboard's
// Organization health section) against a real local Supabase stack.
// Both seed.sql and the nonprofit-status migration plant governance rows,
// so every assertion compares against a baseline summary taken before the
// fixture insert rather than expecting absolute counts.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, test } from "bun:test";
import {
  adminClient,
  createGovernanceMeeting,
  createPerson,
} from "../../../../../test/integration-setup";
import { getOrganizationSummary } from "./queries";

const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
const NEXT_WEEK = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

function summary() {
  const nowIso = new Date().toISOString();
  return getOrganizationSummary(adminClient, nowIso, nowIso.slice(0, 10));
}

describe("getOrganizationSummary (integration)", () => {
  test("surfaces the soonest upcoming scheduled meeting", async () => {
    const meeting = await createGovernanceMeeting({
      meetingDate: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    const result = await summary();

    expect(result.nextMeeting).not.toBeNull();
    // A seeded meeting could be scheduled between now and the fixture, so
    // assert ordering rather than identity.
    expect(
      new Date(result.nextMeeting!.meeting_date).getTime(),
    ).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000 + 1000);

    await meeting.cleanup();
  });

  test("ignores cancelled and past meetings for the next-meeting slot", async () => {
    const cancelled = await createGovernanceMeeting({
      meetingDate: new Date(Date.now() + 60 * 1000).toISOString(),
      status: "cancelled",
    });

    const result = await summary();

    expect(result.nextMeeting?.id).not.toBe(cancelled.id);

    await cancelled.cleanup();
  });

  test("counts open and overdue annual requirements, ignoring done ones", async () => {
    const before = await summary();

    const { data: inserted, error } = await adminClient
      .from("annual_requirements")
      .insert([
        // status is explicit on every row: PostgREST bulk inserts send the
        // union of columns, so a row omitting status would insert null
        // instead of the column default.
        {
          name: "Test overdue filing",
          due_date: YESTERDAY,
          status: "not_started",
        },
        {
          name: "Test upcoming filing",
          due_date: NEXT_WEEK,
          status: "not_started",
        },
        { name: "Test done filing", due_date: YESTERDAY, status: "done" },
      ])
      .select("id");
    if (error) throw error;

    const after = await summary();
    expect(after.openRequirementCount).toBe(before.openRequirementCount + 2);
    expect(after.overdueRequirementCount).toBe(
      before.overdueRequirementCount + 1,
    );

    await adminClient
      .from("annual_requirements")
      .delete()
      .in(
        "id",
        (inserted ?? []).map((row) => row.id),
      );
  });

  test("counts open and overdue milestones, ignoring done and cancelled ones", async () => {
    const before = await summary();

    const { data: inserted, error } = await adminClient
      .from("nonprofit_status_milestones")
      .insert([
        {
          description: "Test overdue milestone",
          phase: "Test",
          due_date: YESTERDAY,
          status: "not_started",
        },
        {
          description: "Test cancelled milestone",
          phase: "Test",
          due_date: YESTERDAY,
          status: "cancelled",
        },
        {
          description: "Test done milestone",
          phase: "Test",
          due_date: YESTERDAY,
          status: "done",
        },
      ])
      .select("id");
    if (error) throw error;

    const after = await summary();
    expect(after.openMilestoneCount).toBe(before.openMilestoneCount + 1);
    expect(after.overdueMilestoneCount).toBe(before.overdueMilestoneCount + 1);

    await adminClient
      .from("nonprofit_status_milestones")
      .delete()
      .in(
        "id",
        (inserted ?? []).map((row) => row.id),
      );
  });

  test("counts open and overdue meeting action items", async () => {
    const before = await summary();

    const meeting = await createGovernanceMeeting();
    const person = await createPerson();
    const { data: inserted, error } = await adminClient
      .from("governance_meeting_action_items")
      .insert([
        {
          meeting_id: meeting.id,
          description: "Test overdue item",
          owner_person_id: person.id,
          due_date: YESTERDAY,
          status: "open",
        },
        {
          meeting_id: meeting.id,
          description: "Test done item",
          owner_person_id: person.id,
          due_date: YESTERDAY,
          status: "done",
        },
      ])
      .select("id");
    if (error) throw error;

    const after = await summary();
    expect(after.openActionItemCount).toBe(before.openActionItemCount + 1);
    expect(after.overdueActionItemCount).toBe(
      before.overdueActionItemCount + 1,
    );

    await adminClient
      .from("governance_meeting_action_items")
      .delete()
      .in(
        "id",
        (inserted ?? []).map((row) => row.id),
      );
    await meeting.cleanup();
    await person.cleanup();
  });

  test("counts active board members missing a current-year COI disclosure", async () => {
    const before = await summary();

    const person = await createPerson();
    const { data: boardMember, error } = await adminClient
      .from("board_members")
      .insert({
        person_id: person.id,
        role_title: "Test Director",
        term_start: YESTERDAY,
      })
      .select("id")
      .single();
    if (error) throw error;

    const missing = await summary();
    expect(missing.missingDisclosureCount).toBe(
      before.missingDisclosureCount + 1,
    );

    const { data: disclosure, error: disclosureError } = await adminClient
      .from("conflict_of_interest_disclosures")
      .insert({
        person_id: person.id,
        disclosure_year: missing.disclosureYear,
        on_file_date: YESTERDAY,
      })
      .select("id")
      .single();
    if (disclosureError) throw disclosureError;

    const disclosed = await summary();
    expect(disclosed.missingDisclosureCount).toBe(
      before.missingDisclosureCount,
    );

    await adminClient
      .from("conflict_of_interest_disclosures")
      .delete()
      .eq("id", disclosure.id);
    await adminClient.from("board_members").delete().eq("id", boardMember.id);
    await person.cleanup();
  });
});
