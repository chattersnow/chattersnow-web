// Integration test: giveaway official rules (#1322) against a real local
// Supabase stack -- the publish gate, the freeze, and what `anon` can see.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPublishedEvent,
  signIn,
} from "../../../../../test/integration-setup";
import { giveawayRulesSettingKey } from "@/lib/giveaway-rules";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  getGiveawayRulesAction,
  publishGiveawayRulesAction,
  saveGiveawayRulesAction,
} = await import("./giveaway-rules-actions");

let eventId: string;
let giveawayId: string;
let packageId: string;

/** The seeded answer this file removes and restores, to exercise the gate. */
const FREE_ENTRY_KEY = giveawayRulesSettingKey("free_entry");
let freeEntryAnswer: unknown;

beforeAll(async () => {
  currentSupabase = await signIn(SEEDED_USERS.admin);
  const event = await createPublishedEvent();
  eventId = event.id;

  const { data: giveaway } = await adminClient
    .from("giveaways")
    .insert({
      event_id: eventId,
      name: "Official rules test",
      drawing_date: "2026-08-15",
    })
    .select("id")
    .single();
  giveawayId = giveaway!.id;

  // Tiers and the grant matrix, so "how to enter" has ways to describe.
  await adminClient.rpc("seed_giveaway_tiers", { p_giveaway_id: giveawayId });
  const { data: gold } = await adminClient
    .from("giveaway_tiers")
    .select("id")
    .eq("giveaway_id", giveawayId)
    .eq("key", "gold")
    .single();

  // A bucket with a prize in it, and tickets in the pool, so the odds can be
  // stated at all.
  const { data: bucket } = await adminClient
    .from("giveaway_buckets")
    .insert({ giveaway_id: giveawayId, tier_id: gold!.id, name: "Gold bucket" })
    .select("id")
    .single();
  await adminClient.from("giveaway_prizes").insert({
    giveaway_id: giveawayId,
    prize_name: "Weekend cabin stay",
    estimated_value: 400,
    bucket_id: bucket!.id,
  });

  const { data: pkg } = await adminClient
    .from("giveaway_ticket_packages")
    .insert({
      giveaway_id: giveawayId,
      name: "Handful",
      price: 20,
      tier_id: gold!.id,
      bundle_quantity: 1,
    })
    .select("id")
    .single();
  packageId = pkg!.id;
  await adminClient.rpc("record_giveaway_ticket_sale", {
    p_giveaway_id: giveawayId,
    p_package_id: packageId,
    p_quantity: 4,
  });

  const { data: answer } = await adminClient
    .from("app_settings")
    .select("value")
    .eq("key", FREE_ENTRY_KEY)
    .maybeSingle();
  freeEntryAnswer = answer?.value ?? null;
});

afterAll(async () => {
  if (freeEntryAnswer !== null) {
    await adminClient
      .from("app_settings")
      .update({ value: freeEntryAnswer })
      .eq("key", FREE_ENTRY_KEY);
  }
  await adminClient.from("giveaways").delete().eq("id", giveawayId);
  await adminClient.from("events").delete().eq("id", eventId);
});

describe("the publish gate (integration)", () => {
  test("refuses while a question the organization owns is unanswered", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
    await adminClient
      .from("app_settings")
      .update({ value: [] })
      .eq("key", FREE_ENTRY_KEY);

    const state = await getGiveawayRulesAction(giveawayId);
    if (!("data" in state)) throw new Error("expected editor state");
    expect(state.data.gaps.map((gap) => gap.sectionId)).toEqual(["free-entry"]);

    const result = await publishGiveawayRulesAction(giveawayId);
    expect("error" in result).toBe(true);

    // And nothing was served: a refused publish leaves no page behind.
    const { data } = await anonClient()
      .from("public_giveaway_rules")
      .select("version")
      .eq("giveaway_id", giveawayId);
    expect(data ?? []).toHaveLength(0);
  });

  test("publishes once every section has something to say", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
    await adminClient
      .from("app_settings")
      .update({ value: freeEntryAnswer })
      .eq("key", FREE_ENTRY_KEY);

    const result = await publishGiveawayRulesAction(giveawayId);
    expect(result).toMatchObject({ success: true, version: 1 });
  });
});

describe("what the public site gets (integration)", () => {
  test("anon reads the published document, numbers and all", async () => {
    const { data } = await anonClient()
      .from("public_giveaway_rules")
      .select("version, content, event_id")
      .eq("giveaway_id", giveawayId)
      .single();

    expect(data!.version).toBe(1);
    expect(data!.event_id).toBe(eventId);
    const content = data!.content as {
      sections: { id: string; paragraphs: string[] }[];
    };
    const prizes = content.sections.find((section) => section.id === "prizes");
    expect(prizes!.paragraphs.join(" ")).toContain("Weekend cabin stay");
    expect(prizes!.paragraphs.join(" ")).toContain("$400.00");
    const odds = content.sections.find((section) => section.id === "odds");
    // Four packages sold, each granting the gold row's 3 gold tickets.
    expect(odds!.paragraphs.join(" ")).toContain("12");
  });

  // The whole reason a version exists: the numbers an entrant relied on do not
  // move when the giveaway does.
  test("repricing and adding a prize afterwards leaves version 1 alone", async () => {
    const before = await anonClient()
      .from("public_giveaway_rules")
      .select("content")
      .eq("giveaway_id", giveawayId)
      .eq("version", 1)
      .single();

    await adminClient
      .from("giveaway_ticket_packages")
      .update({ price: 50 })
      .eq("id", packageId);
    await adminClient.from("giveaway_prizes").insert({
      giveaway_id: giveawayId,
      prize_name: "Late addition",
      estimated_value: 25,
    });

    const after = await anonClient()
      .from("public_giveaway_rules")
      .select("content")
      .eq("giveaway_id", giveawayId)
      .eq("version", 1)
      .single();

    expect(after.data!.content).toEqual(before.data!.content);
    expect(JSON.stringify(after.data!.content)).not.toContain("Late addition");
  });

  test("a correction is version 2, and version 1 stays readable", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const result = await publishGiveawayRulesAction(giveawayId);
    expect(result).toMatchObject({ success: true, version: 2 });

    const { data } = await anonClient()
      .from("public_giveaway_rules")
      .select("version, content")
      .eq("giveaway_id", giveawayId)
      .order("version", { ascending: false });

    expect((data ?? []).map((row) => row.version)).toEqual([2, 1]);
    expect(JSON.stringify(data![0].content)).toContain("Late addition");
    expect(JSON.stringify(data![1].content)).not.toContain("Late addition");
  });

  test("a giveaway nobody published serves nothing to anon", async () => {
    // Its own event: a giveaway is one per event, so this cannot share the
    // published one's.
    const otherEvent = await createPublishedEvent();
    const { data: other } = await adminClient
      .from("giveaways")
      .insert({ event_id: otherEvent.id, name: "Unpublished" })
      .select("id")
      .single();

    const { data } = await anonClient()
      .from("public_giveaway_rules")
      .select("version")
      .eq("giveaway_id", other!.id);
    expect(data ?? []).toHaveLength(0);

    await adminClient.from("giveaways").delete().eq("id", other!.id);
    await adminClient.from("events").delete().eq("id", otherEvent.id);
  });
});

describe("overrides and the version table (integration)", () => {
  test("a section rewritten here is what the next version publishes", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const saved = await saveGiveawayRulesAction(giveawayId, {
      oddsBasis: "overall",
      overrides: {
        "winner-publication": ["We publish nothing at all about a winner."],
      },
    });
    expect(saved).toEqual({ success: true });

    const published = await publishGiveawayRulesAction(giveawayId);
    expect(published).toMatchObject({ success: true, version: 3 });

    const { data } = await anonClient()
      .from("public_giveaway_rules")
      .select("content")
      .eq("giveaway_id", giveawayId)
      .eq("version", 3)
      .single();
    const content = data!.content as {
      sections: { id: string; paragraphs: string[] }[];
    };
    expect(
      content.sections.find((section) => section.id === "winner-publication")!
        .paragraphs,
    ).toEqual(["We publish nothing at all about a winner."]);
  });

  // publish_giveaway_rules() is the table's only writer, and the absence of an
  // insert grant is what makes a version number mean something.
  test("a signed-in session cannot write a version row itself", async () => {
    const { data: rules } = await adminClient
      .from("giveaway_rules")
      .select("id")
      .eq("giveaway_id", giveawayId)
      .single();

    const { error } = await adminClient.from("giveaway_rules_versions").insert({
      giveaway_rules_id: rules!.id,
      version: 99,
      content: { title: "Forged" },
    });
    expect(error).not.toBeNull();
  });
});
