// Integration test for the riding questions on registration's second step
// (#1415), against the real RPCs on a local Supabase stack: the answers land
// on the person in the registration's own transaction, on both registration
// paths, and a tenant without the rider_profile module writes none of them.
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import {
  adminClient,
  anonClient,
  createPublishedEvent,
  enableModule,
  seededTenantId,
  serviceRoleClient,
  signIn,
  uniqueEmail,
  uniqueIp,
  withModule,
} from "../../../../test/integration-setup";

mock.module("next/cache", () => ({ revalidatePath: () => {} }));
// The confirmation is scheduled with after(), which throws outside a request
// scope, and its sender imports "server-only". Nothing here reads the email,
// so the task is dropped; the rest of next/server is kept, as in
// event-registration-actions.integration.test.ts.
mock.module("server-only", () => ({}));
const nextServer = await import("next/server");
mock.module("next/server", () => ({ ...nextServer, after: () => {} }));

let currentIp: string | null = null;
mock.module("@/lib/get-client-ip", () => ({
  getClientIp: async () => currentIp,
}));

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => anonClient(),
}));

const { registerForEventAction } = await import("./event-registration-actions");

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);

let tenantId: string;
let restoreModule: () => Promise<void>;
const cleanups: (() => Promise<void>)[] = [];
const createdUsers: string[] = [];
const createdPeople: string[] = [];
// register_for_event() mints a person per new address; they outlive the
// event's own cleanup.
const registeredEmails: string[] = [];

beforeAll(async () => {
  tenantId = await seededTenantId();
  restoreModule = await enableModule(tenantId, "constituent_accounts");
});

afterAll(async () => {
  while (cleanups.length) await cleanups.pop()!();
  if (registeredEmails.length) {
    await service.from("people").delete().in("email", registeredEmails);
  }
  if (createdPeople.length) {
    await service.from("people").delete().in("id", createdPeople);
  }
  for (const id of createdUsers) await service.auth.admin.deleteUser(id);
  await restoreModule();
});

async function event() {
  const fixture = await createPublishedEvent({ name: `Riding ${run}` });
  cleanups.push(fixture.cleanup);
  return fixture.id;
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

/** The anonymous form's fields, with the riding questions asked. */
function registrationForm(email: string, riding: Record<string, string>) {
  return formData({
    name: "Riding Registrant",
    email,
    partyIncludesMinor: "no",
    ridingAsked: "on",
    ...riding,
  });
}

async function register(riding: Record<string, string>, fields = {}) {
  currentIp = uniqueIp();
  const email = uniqueEmail(`riding-${run}`);
  registeredEmails.push(email);
  const eventId = await event();
  const fd = registrationForm(email, riding);
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, String(value));
  }
  const result = await registerForEventAction(eventId, fd);
  return { result, email, eventId };
}

async function ridingOf(email: string) {
  const { data, error } = await adminClient
    .from("people")
    .select(
      "riding_discipline, ski_experience_level, snowboard_experience_level, preferred_mountain",
    )
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const NOTHING = {
  riding_discipline: null,
  ski_experience_level: null,
  snowboard_experience_level: null,
  preferred_mountain: null,
};

describe("the anonymous registration form", () => {
  test.each([
    [
      "ski",
      { skiExperienceLevel: "intermediate" },
      {
        ski_experience_level: "intermediate",
        snowboard_experience_level: null,
      },
    ],
    [
      "snowboard",
      { snowboardExperienceLevel: "beginner" },
      { ski_experience_level: null, snowboard_experience_level: "beginner" },
    ],
    [
      "both",
      { skiExperienceLevel: "beginner", snowboardExperienceLevel: "advanced" },
      {
        ski_experience_level: "beginner",
        snowboard_experience_level: "advanced",
      },
    ],
  ])(
    "writes a %s rider's answers to the person",
    async (discipline, levels, expected) => {
      const { result, email } = await register({
        ridingDiscipline: discipline,
        ...levels,
        preferredMountain: "Hunter",
      });

      expect(result).toMatchObject({ success: true });
      expect(await ridingOf(email)).toEqual({
        riding_discipline: discipline,
        ...expected,
        preferred_mountain: "Hunter",
      });
    },
  );

  test("stores a typed mountain, never the literal Other", async () => {
    const { email } = await register({
      ridingDiscipline: "ski",
      skiExperienceLevel: "advanced",
      preferredMountain: "Other",
      otherMountain: "  Jay Peak ",
    });
    expect((await ridingOf(email))?.preferred_mountain).toBe("Jay Peak");
  });

  test("refuses a missing level on step 2, and registers nothing", async () => {
    const { result, email } = await register({ ridingDiscipline: "both" });

    expect(result).toMatchObject({ step: "event" });
    expect(await ridingOf(email)).toBeNull();
  });

  test("the RPC refuses a discipline without its level and rolls the registration back", async () => {
    const eventId = await event();
    const email = uniqueEmail(`riding-rpc-${run}`);
    registeredEmails.push(email);

    const { error } = await anonClient().rpc("register_for_event", {
      p_event_id: eventId,
      p_name: "Riding RPC",
      p_email: email,
      p_phone: "",
      p_party_size: 1,
      p_notes: "",
      p_ip_address: uniqueIp(),
      p_party_includes_minor: false,
      p_riding_discipline: "both",
      p_ski_experience_level: "beginner",
    });

    expect(error?.message).toBe("INVALID_RIDER_PROFILE");
    const { count } = await adminClient
      .from("event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId);
    expect(count).toBe(0);
  });

  test("a form that did not ask registers without touching the person", async () => {
    currentIp = uniqueIp();
    const email = uniqueEmail(`riding-unasked-${run}`);
    registeredEmails.push(email);
    const result = await registerForEventAction(
      await event(),
      formData({ name: "Unasked", email, partyIncludesMinor: "no" }),
    );

    expect(result).toMatchObject({ success: true });
    expect(await ridingOf(email)).toEqual(NOTHING);
  });

  test("a tenant without the module registers and writes no riding answer (#1408)", async () => {
    await withModule(tenantId, "rider_profile", false, async () => {
      const { result, email } = await register({
        ridingDiscipline: "ski",
        skiExperienceLevel: "beginner",
        preferredMountain: "Hunter",
      });

      expect(result).toMatchObject({ success: true });
      expect(await ridingOf(email)).toEqual(NOTHING);
    });
  });

  test("a filled honeypot writes nothing", async () => {
    const { result, email } = await register(
      { ridingDiscipline: "ski", skiExperienceLevel: "beginner" },
      { company: "definitely-a-bot" },
    );

    expect(result).toMatchObject({ success: true });
    expect(await ridingOf(email)).toBeNull();
  });

  test("the public API's follow-up still refuses without the module", async () => {
    const { result } = await register({
      ridingDiscipline: "ski",
      skiExperienceLevel: "beginner",
    });
    if (!("success" in result)) throw new Error(result.error);

    await withModule(tenantId, "rider_profile", false, async () => {
      const { error } = await anonClient().rpc(
        "save_registrant_rider_profile",
        {
          p_registration_id: result.registrationId,
          p_riding_discipline: "snowboard",
          p_snowboard_experience_level: "beginner",
          p_ip_address: uniqueIp(),
        },
      );
      expect(error?.message).toBe("SECTION_UNAVAILABLE");
    });
  });
});

describe("registering as yourself", () => {
  async function constituent() {
    const email = uniqueEmail(`riding-my-${run}`);
    const { data: user, error: userError } =
      await service.auth.admin.createUser({
        email,
        password: "password123",
        email_confirm: true,
      });
    if (userError) throw userError;
    createdUsers.push(user.user!.id);
    const { data: person, error } = await service
      .from("people")
      .insert({
        tenant_id: tenantId,
        source_type: "other",
        name: `Riding Registrant ${run}`,
        email,
        auth_user_id: user.user!.id,
        riding_discipline: "ski",
        ski_experience_level: "beginner",
      })
      .select("id")
      .single();
    if (error) throw error;
    createdPeople.push(person.id as string);
    return { client: await signIn(email), email };
  }

  test("writes the answers back to their own record", async () => {
    const { client, email } = await constituent();

    const { error } = await client.rpc("register_myself_for_event", {
      p_event_id: await event(),
      p_party_size: 1,
      p_ip_address: uniqueIp(),
      p_party_includes_minor: false,
      p_riding_discipline: "snowboard",
      p_snowboard_experience_level: "intermediate",
      p_preferred_mountain: "Windham",
    });

    expect(error).toBeNull();
    expect(await ridingOf(email)).toEqual({
      riding_discipline: "snowboard",
      ski_experience_level: null,
      snowboard_experience_level: "intermediate",
      preferred_mountain: "Windham",
    });
  });

  test("leaves the record alone when nothing is sent", async () => {
    const { client, email } = await constituent();

    const { error } = await client.rpc("register_myself_for_event", {
      p_event_id: await event(),
      p_party_size: 1,
      p_ip_address: uniqueIp(),
      p_party_includes_minor: false,
    });

    expect(error).toBeNull();
    expect(await ridingOf(email)).toMatchObject({
      riding_discipline: "ski",
      ski_experience_level: "beginner",
    });
  });
});
