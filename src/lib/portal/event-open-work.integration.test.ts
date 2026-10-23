// Integration test: the Events list's Outstanding tasks (#1661) -- the
// four-source query, its filters, the dashboard count it shares, and the
// check-off actions it drives -- against a real local Supabase stack, so the
// sources' real RLS decides what each role reads and may change. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createPerson,
  createPublishedEvent,
  signInAs,
  unprivilegedActors,
} from "../../../test/integration-setup";
import { DEFAULT_TASK_FILTERS, type TaskFilters } from "./task-list";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { countEventOpenWork, getEventOpenWork } =
  await import("./event-open-work");
const { toggleEventChecklistItemAction } =
  await import("@/app/portal/(app)/events/checklist-actions");
const { setEventRetroActionDoneAction } =
  await import("@/app/portal/(app)/events/retro-actions");
const { setEventSponsorFollowUpDoneAction } =
  await import("@/app/portal/(app)/events/sponsors-actions");

// A fixed day, so "overdue" doesn't depend on when CI runs.
const TODAY = "2031-03-10";
const tag = crypto.randomUUID().slice(0, 8);

let adminPersonId: string;
let owner: Awaited<ReturnType<typeof createPerson>>;
let lead: Awaited<ReturnType<typeof createPerson>>;
let sponsor: Awaited<ReturnType<typeof createPerson>>;
let event: Awaited<ReturnType<typeof createPublishedEvent>>;

const ids: Record<string, string> = {};

async function insert(
  table: string,
  name: string,
  values: Record<string, unknown>,
) {
  const { data, error } = await adminClient
    .from(table)
    .insert(values)
    .select("id")
    .single();
  if (error) throw error;
  ids[name] = data.id as string;
}

function filters(overrides: Partial<TaskFilters> = {}): TaskFilters {
  return { ...DEFAULT_TASK_FILTERS, ...overrides };
}

/** This run's rows, by fixture name, so the seed's own rows don't matter. */
async function fixtureKeys(
  client: SupabaseClient,
  overrides: Partial<TaskFilters> = {},
) {
  const work = await getEventOpenWork(client, filters(overrides), {
    canEdit: false,
    today: TODAY,
  });
  const byKey = new Map(work.rows.map((row) => [row.key, row]));
  return {
    work,
    has: (kind: string, name: string) => byKey.has(`${kind}:${ids[name]}`),
    row: (kind: string, name: string) => byKey.get(`${kind}:${ids[name]}`),
  };
}

beforeAll(async () => {
  const { data: personId, error } = await adminClient.rpc(
    "resolve_current_person_id",
  );
  if (error || !personId) throw new Error("admin user has no people row");
  adminPersonId = personId as string;

  owner = await createPerson({ name: `IT Event Task Owner ${tag}` });
  lead = await createPerson({ name: `IT Event Lead ${tag}` });
  sponsor = await createPerson({ name: `IT Sponsor ${tag}` });
  // Upcoming, with a lead but no planning filled in: one phase task.
  event = await createPublishedEvent({
    name: `IT Outstanding ${tag}`,
    eventLeadId: lead.id,
  });

  const {
    data: { user },
  } = await adminClient.auth.getUser();

  await insert("event_checklist_items", "checklistOverdueMine", {
    event_id: event.id,
    title: `IT checklist overdue ${tag}`,
    owner_person_id: adminPersonId,
    due_date: "2031-03-01",
  });
  await insert("event_checklist_items", "checklistDone", {
    event_id: event.id,
    title: `IT checklist done ${tag}`,
    is_done: true,
    completed_at: new Date().toISOString(),
  });
  await insert("event_retro_items", "retroOpen", {
    event_id: event.id,
    kind: "action",
    body: `IT retro action ${tag}`,
    status: "open",
    owner_person_id: owner.id,
    author_id: user!.id,
  });
  await insert("event_retro_items", "retroNote", {
    event_id: event.id,
    kind: "improve",
    body: `IT retro note ${tag}`,
    author_id: user!.id,
  });
  await insert("event_sponsors", "sponsorOpen", {
    event_id: event.id,
    person_id: sponsor.id,
    support_type: "cash",
    follow_up_status: "in_progress",
    follow_up_owner_person_id: owner.id,
    follow_up_due_date: "2031-03-20",
  });
});

afterAll(async () => {
  await event.cleanup();
  await Promise.all([owner.cleanup(), lead.cleanup(), sponsor.cleanup()]);
});

describe("getEventOpenWork (integration)", () => {
  test("lists every open source with its owner, due date and event", async () => {
    const { has, row } = await fixtureKeys(adminClient);

    expect(row("checklist", "checklistOverdueMine")).toMatchObject({
      owner: { id: adminPersonId },
      dueDate: "2031-03-01",
      source: { href: `/portal/events/${event.id}?tab=checklist` },
      event: { id: event.id },
    });
    expect(row("retro_action", "retroOpen")).toMatchObject({
      owner: { id: owner.id },
      source: { href: `/portal/events/${event.id}?tab=results` },
    });
    expect(row("sponsor_follow_up", "sponsorOpen")).toMatchObject({
      title: `Follow up with IT Sponsor ${tag}`,
      owner: { id: owner.id },
      dueDate: "2031-03-20",
      statusLabel: "In progress",
    });
    // Done items and retro notes are not open work.
    expect(has("checklist", "checklistDone")).toBe(false);
    expect(has("retro_action", "retroNote")).toBe(false);
  });

  test("phase tasks are owned by the event lead and never editable", async () => {
    const work = await getEventOpenWork(adminClient, filters(), {
      canEdit: true,
      today: TODAY,
    });
    const phase = work.rows.filter(
      (row) => row.kind === "phase" && row.event.id === event.id,
    );
    expect(phase.length).toBeGreaterThan(0);
    for (const row of phase) {
      expect(row.owner?.id).toBe(lead.id);
      expect(row.canEdit).toBe(false);
    }
    expect(
      work.rows
        .filter((row) => row.kind !== "phase")
        .every((row) => row.canEdit),
    ).toBe(true);
  });

  test("filters by owner (Mine), type, overdue and status, overdue first", async () => {
    const mine = await fixtureKeys(adminClient, { owner: "mine" });
    expect(mine.has("checklist", "checklistOverdueMine")).toBe(true);
    expect(mine.has("retro_action", "retroOpen")).toBe(false);

    const byOwner = await fixtureKeys(adminClient, { owner: owner.id });
    expect(byOwner.has("retro_action", "retroOpen")).toBe(true);
    expect(byOwner.has("sponsor_follow_up", "sponsorOpen")).toBe(true);
    expect(byOwner.has("checklist", "checklistOverdueMine")).toBe(false);

    const sponsorsOnly = await fixtureKeys(adminClient, {
      type: "sponsor_follow_up",
    });
    expect(
      sponsorsOnly.work.rows.every((row) => row.kind === "sponsor_follow_up"),
    ).toBe(true);

    const overdue = await fixtureKeys(adminClient, { due: "overdue" });
    expect(overdue.has("checklist", "checklistOverdueMine")).toBe(true);
    expect(overdue.has("sponsor_follow_up", "sponsorOpen")).toBe(false);

    const done = await fixtureKeys(adminClient, { status: "done" });
    expect(done.has("checklist", "checklistDone")).toBe(true);
    expect(done.has("checklist", "checklistOverdueMine")).toBe(false);

    const all = await fixtureKeys(adminClient);
    const firstUndated = all.work.rows.findIndex((row) => !row.dueDate);
    const overdueIndex = all.work.rows.findIndex(
      (row) => row.key === `checklist:${ids.checklistOverdueMine}`,
    );
    expect(firstUndated === -1 || overdueIndex < firstUndated).toBe(true);
  });

  test("the dashboard count is the list's unfiltered open total", async () => {
    const unfiltered = await getEventOpenWork(adminClient, filters(), {
      canEdit: true,
      today: TODAY,
    });
    const narrowed = await getEventOpenWork(
      adminClient,
      filters({ owner: "mine", status: "all" }),
      { canEdit: true, today: TODAY },
    );
    const count = await countEventOpenWork(adminClient);

    expect(unfiltered.openCount).toBe(unfiltered.rows.length);
    expect(count).toBe(unfiltered.openCount);
    // Filters narrow the rows, never the count.
    expect(narrowed.openCount).toBe(count);
  });

  test("a view-only events role sees the rows", async () => {
    const finance = await signInAs(SEEDED_USERS.finance);
    const { has } = await fixtureKeys(finance);
    expect(has("checklist", "checklistOverdueMine")).toBe(true);
    expect(has("retro_action", "retroOpen")).toBe(true);
    expect(has("sponsor_follow_up", "sponsorOpen")).toBe(true);
  });

  test("actors without events:view read nothing", async () => {
    for (const { name, client } of await unprivilegedActors()) {
      // volunteer holds events:view, so it is the view-only case above.
      if (name === "volunteer") continue;
      // Anonymous has no table grant at all, so it is refused outright;
      // signed-in roles are filtered to nothing by RLS. Either way, no rows.
      const count = await countEventOpenWork(client).catch(() => 0);
      expect({ actor: name, count }).toEqual({ actor: name, count: 0 });
    }
  });
});

describe("Outstanding tasks check-off actions (integration)", () => {
  const DENIED = {
    error: "You don't have permission to perform this action.",
  };

  test("the view-only role cannot check anything off", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    expect(
      await toggleEventChecklistItemAction(ids.checklistOverdueMine, true),
    ).toEqual(DENIED);
    expect(await setEventRetroActionDoneAction(ids.retroOpen, true)).toEqual({
      error: "Only the item's author or an event manager can change it.",
    });
    expect(
      await setEventSponsorFollowUpDoneAction(ids.sponsorOpen, true),
    ).toEqual(DENIED);

    // Still open, all three.
    const { has } = await fixtureKeys(adminClient);
    expect(has("checklist", "checklistOverdueMine")).toBe(true);
    expect(has("retro_action", "retroOpen")).toBe(true);
    expect(has("sponsor_follow_up", "sponsorOpen")).toBe(true);
  });

  test("an events manager checks each source off and reopens it", async () => {
    currentSupabase = adminClient;
    const before = await countEventOpenWork(adminClient);

    expect(
      await toggleEventChecklistItemAction(ids.checklistOverdueMine, true),
    ).toEqual({ success: true });
    expect(await setEventRetroActionDoneAction(ids.retroOpen, true)).toEqual({
      success: true,
    });
    expect(
      await setEventSponsorFollowUpDoneAction(ids.sponsorOpen, true),
    ).toEqual({ success: true });

    const open = await fixtureKeys(adminClient);
    expect(open.has("checklist", "checklistOverdueMine")).toBe(false);
    expect(open.has("retro_action", "retroOpen")).toBe(false);
    expect(open.has("sponsor_follow_up", "sponsorOpen")).toBe(false);
    expect(await countEventOpenWork(adminClient)).toBe(before - 3);

    const done = await fixtureKeys(adminClient, { status: "done" });
    expect(done.has("sponsor_follow_up", "sponsorOpen")).toBe(true);
    expect(done.row("retro_action", "retroOpen")?.isDone).toBe(true);

    // The sponsorship itself is untouched: only the follow-up moved.
    const { data: sponsorRow } = await adminClient
      .from("event_sponsors")
      .select("support_type, follow_up_owner_person_id, follow_up_due_date")
      .eq("id", ids.sponsorOpen)
      .single();
    expect(sponsorRow).toEqual({
      support_type: "cash",
      follow_up_owner_person_id: owner.id,
      follow_up_due_date: "2031-03-20",
    });

    await toggleEventChecklistItemAction(ids.checklistOverdueMine, false);
    await setEventRetroActionDoneAction(ids.retroOpen, false);
    expect(
      await setEventSponsorFollowUpDoneAction(ids.sponsorOpen, false),
    ).toEqual({ success: true });
    expect(await countEventOpenWork(adminClient)).toBe(before);
  });

  test("an unknown sponsor id is refused rather than silently ignored", async () => {
    currentSupabase = adminClient;
    expect(
      await setEventSponsorFollowUpDoneAction(crypto.randomUUID(), true),
    ).toEqual({ error: "Could not update the follow-up. Please try again." });
  });
});
