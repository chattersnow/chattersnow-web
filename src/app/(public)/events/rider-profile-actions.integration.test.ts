// Integration test: exercises the real saveRiderProfileAction against a real
// local Supabase stack (save_registrant_rider_profile RPC, RLS, rate
// limiting). Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  adminClient,
  anonClient,
  createPublishedEvent,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";

mock.module("next/cache", () => ({ revalidatePath: () => {} }));

let currentIp: string | null = null;
mock.module("@/lib/get-client-ip", () => ({
  getClientIp: async () => currentIp,
}));

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => anonClient(),
}));

const { registerForEventAction } = await import("./event-registration-actions");
const { saveRiderProfileAction } = await import("./rider-profile-actions");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length) {
    const cleanup = cleanups.pop()!;
    await cleanup();
  }
});

// Registers for a fresh event and hands back the registration id plus the
// person row it resolved to -- the same starting state a real visitor is in
// when the follow-up step renders.
async function registration() {
  const fixture = await createPublishedEvent();

  const email = uniqueEmail("rider-profile");
  const result = await registerForEventAction(
    fixture.id,
    formData({ name: "Rider Fixture", email }),
  );
  if (!("success" in result)) throw new Error(result.error);

  const { data, error } = await adminClient
    .from("event_registrations")
    .select("person_id")
    .eq("id", result.registrationId)
    .single();
  if (error) throw error;

  const personId = data.person_id as string;
  // One cleanup, ordered: the event has to go first so its registrations
  // cascade away, or the person row is still referenced and won't delete.
  cleanups.push(async () => {
    await fixture.cleanup();
    await adminClient.from("people").delete().eq("id", personId);
  });

  return { registrationId: result.registrationId, personId };
}

async function riderProfile(personId: string) {
  const { data, error } = await adminClient
    .from("people")
    .select(
      "riding_discipline, ski_experience_level, snowboard_experience_level, preferred_mountain",
    )
    .eq("id", personId)
    .single();
  if (error) throw error;
  return data;
}

describe("saveRiderProfileAction (integration)", () => {
  test("saves a full rider profile onto the registrant's person row", async () => {
    currentIp = uniqueIp();
    const { registrationId, personId } = await registration();

    const result = await saveRiderProfileAction(
      registrationId,
      formData({
        ridingDiscipline: "both",
        skiExperienceLevel: "beginner",
        snowboardExperienceLevel: "advanced",
        preferredMountain: "Hunter",
      }),
    );

    expect(result).toEqual({ success: true });
    expect(await riderProfile(personId)).toEqual({
      riding_discipline: "both",
      ski_experience_level: "beginner",
      snowboard_experience_level: "advanced",
      preferred_mountain: "Hunter",
    });
  });

  test("clears the level for a discipline they don't ride", async () => {
    currentIp = uniqueIp();
    const { registrationId, personId } = await registration();

    // A hand-built request that lies about the snowboard level: the write
    // path must drop it rather than store a level for a discipline they
    // don't ride (the parser clears it, and the RPC and a CHECK constraint
    // back that up).
    const fd = formData({
      ridingDiscipline: "ski",
      skiExperienceLevel: "advanced",
    });
    fd.set("snowboardExperienceLevel", "beginner");

    expect(await saveRiderProfileAction(registrationId, fd)).toEqual({
      success: true,
    });
    expect(await riderProfile(personId)).toMatchObject({
      riding_discipline: "ski",
      ski_experience_level: "advanced",
      snowboard_experience_level: null,
    });
  });

  test("rejects an unknown registration id", async () => {
    currentIp = uniqueIp();
    await registration();

    const result = await saveRiderProfileAction(
      crypto.randomUUID(),
      formData({ ridingDiscipline: "ski", skiExperienceLevel: "beginner" }),
    );

    expect(result).toEqual({
      error:
        "You're registered — we just couldn't save your ride details. Reply to your confirmation and we'll add them.",
    });
  });

  test("rejects a registration older than the follow-up window", async () => {
    currentIp = uniqueIp();
    const { registrationId, personId } = await registration();

    await adminClient
      .from("event_registrations")
      .update({
        created_at: new Date(
          Date.now() - 2 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      })
      .eq("id", registrationId);

    const result = await saveRiderProfileAction(
      registrationId,
      formData({ ridingDiscipline: "ski", skiExperienceLevel: "beginner" }),
    );

    expect("error" in result).toBe(true);
    expect(await riderProfile(personId)).toMatchObject({
      riding_discipline: null,
    });
  });

  test("silently writes nothing when the honeypot is filled", async () => {
    currentIp = uniqueIp();
    const { registrationId, personId } = await registration();

    const result = await saveRiderProfileAction(
      registrationId,
      formData({
        ridingDiscipline: "both",
        skiExperienceLevel: "beginner",
        snowboardExperienceLevel: "advanced",
        company: "definitely-a-bot",
      }),
    );

    // Reports success so probing bots learn nothing -- the DB is the only
    // place the difference shows.
    expect(result).toEqual({ success: true });
    expect(await riderProfile(personId)).toEqual({
      riding_discipline: null,
      ski_experience_level: null,
      snowboard_experience_level: null,
      preferred_mountain: null,
    });
  });

  test("rate limits repeated attempts from one IP", async () => {
    currentIp = uniqueIp();
    const { registrationId } = await registration();

    const answers = formData({
      ridingDiscipline: "ski",
      skiExperienceLevel: "beginner",
    });

    // The limiter is keyed per route, so registering first doesn't spend any
    // of this route's budget of 8.
    for (let i = 0; i < 8; i++) {
      expect(await saveRiderProfileAction(registrationId, answers)).toEqual({
        success: true,
      });
    }

    expect(await saveRiderProfileAction(registrationId, answers)).toEqual({
      error: "Too many attempts — please try again in a few minutes.",
    });
  });

  test("leaves the registration itself intact when the profile write fails", async () => {
    currentIp = uniqueIp();
    const { registrationId } = await registration();

    await saveRiderProfileAction(
      registrationId,
      formData({ ridingDiscipline: "snowshoe" }),
    );

    const { data } = await adminClient
      .from("event_registrations")
      .select("id")
      .eq("id", registrationId)
      .maybeSingle();
    expect(data?.id).toBe(registrationId);
  });
});
