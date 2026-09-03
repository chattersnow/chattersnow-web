// Integration test: the point of these cases is RLS, which mocks can't prove.
// public.user_onboarding is the first table in this schema whose write access
// is self-scoped rather than permission-scoped, so what's being defended here
// is that a volunteer (who holds people:none and administration:none) can
// record their own tour progress, and that neither they nor anyone else can
// touch another account's row. Requires `bun run db:start && bun run db:reset`;
// run via `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  deleteOnboarding,
  setOnboarding,
  signInAs,
} from "../../../../../test/integration-setup";

async function userIdFor(email: string) {
  const { data } = await adminClient.rpc("list_portal_users");
  const row = (data as { user_id: string; email: string }[] | null)?.find(
    (u) => u.email === email,
  );
  return row?.user_id ?? null;
}

async function onboardingFor(email: string) {
  const userId = await userIdFor(email);
  if (!userId) return null;
  const { data } = await adminClient
    .from("user_onboarding")
    .select("user_id, first_seen_at, welcome_completed_at, last_release_seen")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

// supabase/seed.sql marks every seeded account's welcome as already
// completed -- otherwise the tour's modal would sit over every portal page the
// e2e suite drives -- so restoring that, not clearing it, is the correct
// revert. Cleanup runs as each account itself rather than through adminClient:
// writes here are self-scoped by design, so an admin session genuinely cannot
// touch someone else's row.
const touchedEmails: string[] = [];

// What supabase/seed.sql leaves every account in.
const SEEDED_RELEASE = "9999-12-31";

afterEach(async () => {
  while (touchedEmails.length > 0) {
    const email = touchedEmails.pop()!;
    const userId = await userIdFor(email);
    if (!userId) continue;
    // Straight through the service role: mark_release_seen only moves the
    // pointer forward, so it can't put a lowered fixture value back.
    await setOnboarding(userId, {
      welcome_completed_at: new Date().toISOString(),
      last_release_seen: SEEDED_RELEASE,
    });
  }
});

describe("user_onboarding RPCs (integration)", () => {
  test("a volunteer can complete their own welcome", async () => {
    const supabase = await signInAs(SEEDED_USERS.volunteer);
    touchedEmails.push(SEEDED_USERS.volunteer);
    // The seed marks every account as already toured, so start from the state
    // a genuinely new account is in.
    await supabase.rpc("reset_my_welcome");

    const { error } = await supabase.rpc("complete_my_welcome");
    expect(error).toBeNull();

    const row = await onboardingFor(SEEDED_USERS.volunteer);
    expect(row?.welcome_completed_at).not.toBeNull();
  });

  test("ensure_my_onboarding reports the flag and is idempotent", async () => {
    const supabase = await signInAs(SEEDED_USERS.board);
    touchedEmails.push(SEEDED_USERS.board);
    await supabase.rpc("reset_my_welcome");

    const first = await supabase.rpc("ensure_my_onboarding", {
      p_current_release: null,
    });
    expect(first.error).toBeNull();
    const before = (
      first.data as {
        first_seen_at: string;
        welcome_completed_at: string | null;
      }[]
    )[0];
    expect(before.first_seen_at).toBeTruthy();
    expect(before.welcome_completed_at).toBeNull();

    await supabase.rpc("complete_my_welcome");

    const second = await supabase.rpc("ensure_my_onboarding", {
      p_current_release: null,
    });
    const after = (
      second.data as {
        first_seen_at: string;
        welcome_completed_at: string | null;
      }[]
    )[0];
    // First-login time is set once and never moves.
    expect(after.first_seen_at).toBe(before.first_seen_at);
    expect(after.welcome_completed_at).not.toBeNull();
  });

  test("finishing the tour also catches the user up on release notes", async () => {
    const supabase = await signInAs(SEEDED_USERS.volunteer);
    touchedEmails.push(SEEDED_USERS.volunteer);
    // The state every account is in on the deploy that ships both of these:
    // tour owed, no release pointer.
    await setOnboarding((await userIdFor(SEEDED_USERS.volunteer))!, {
      welcome_completed_at: null,
      last_release_seen: null,
    });

    await supabase.rpc("complete_my_welcome", {
      p_current_release: "2026-09-03",
    });

    // Otherwise the "what's new" modal opens directly behind the tour, on this
    // deploy announcing the very tour they just finished.
    const row = await onboardingFor(SEEDED_USERS.volunteer);
    expect(row?.last_release_seen).toBe("2026-09-03");
  });

  test("completing twice keeps the original completion time", async () => {
    const supabase = await signInAs(SEEDED_USERS.finance);
    touchedEmails.push(SEEDED_USERS.finance);

    await supabase.rpc("complete_my_welcome");
    const first = await onboardingFor(SEEDED_USERS.finance);
    await supabase.rpc("complete_my_welcome");
    const second = await onboardingFor(SEEDED_USERS.finance);

    expect(second?.welcome_completed_at).toBe(first!.welcome_completed_at!);
  });

  test("reset_my_welcome makes the tour owed again", async () => {
    const supabase = await signInAs(SEEDED_USERS.coordinator);
    touchedEmails.push(SEEDED_USERS.coordinator);

    await supabase.rpc("complete_my_welcome");
    expect(
      (await onboardingFor(SEEDED_USERS.coordinator))?.welcome_completed_at,
    ).not.toBeNull();

    const { error } = await supabase.rpc("reset_my_welcome");
    expect(error).toBeNull();
    expect(
      (await onboardingFor(SEEDED_USERS.coordinator))?.welcome_completed_at,
    ).toBeNull();
  });

  test("it only ever touches the caller's own row", async () => {
    // Put the admin back in the un-toured state first, so this asserts "still
    // owed" rather than passing vacuously against the seeded completion.
    await adminClient.rpc("reset_my_welcome");
    touchedEmails.push(SEEDED_USERS.admin);

    const supabase = await signInAs(SEEDED_USERS.volunteer);
    touchedEmails.push(SEEDED_USERS.volunteer);
    await supabase.rpc("complete_my_welcome");

    const adminRow = await onboardingFor(SEEDED_USERS.admin);
    expect(adminRow).not.toBeNull();
    expect(adminRow?.welcome_completed_at).toBeNull();
  });

  test("a user cannot read another account's onboarding row", async () => {
    const supabase = await signInAs(SEEDED_USERS.volunteer);
    const adminUserId = await userIdFor(SEEDED_USERS.admin);

    const { data } = await supabase
      .from("user_onboarding")
      .select("user_id")
      .eq("user_id", adminUserId!);

    expect(data).toEqual([]);
  });

  test("an anonymous caller is rejected", async () => {
    const { error } = await anonClient().rpc("complete_my_welcome");
    expect(error).not.toBeNull();
  });
});

describe("mark_release_seen (integration)", () => {
  test("a volunteer can record the release they were shown", async () => {
    const supabase = await signInAs(SEEDED_USERS.volunteer);
    touchedEmails.push(SEEDED_USERS.volunteer);
    await setOnboarding((await userIdFor(SEEDED_USERS.volunteer))!, {
      last_release_seen: null,
    });

    const { error } = await supabase.rpc("mark_release_seen", {
      p_release: "2026-09-03",
    });
    expect(error).toBeNull();

    const row = await onboardingFor(SEEDED_USERS.volunteer);
    expect(row?.last_release_seen).toBe("2026-09-03");
  });

  test("the pointer only ever moves forward", async () => {
    const supabase = await signInAs(SEEDED_USERS.board);
    touchedEmails.push(SEEDED_USERS.board);
    await setOnboarding((await userIdFor(SEEDED_USERS.board))!, {
      last_release_seen: null,
    });

    await supabase.rpc("mark_release_seen", { p_release: "2026-10-01" });
    // A tab left open across a deploy dismisses the older notes it rendered;
    // that must not un-see the newer release.
    await supabase.rpc("mark_release_seen", { p_release: "2026-09-03" });

    const row = await onboardingFor(SEEDED_USERS.board);
    expect(row?.last_release_seen).toBe("2026-10-01");
  });

  test("an empty release key is rejected", async () => {
    const supabase = await signInAs(SEEDED_USERS.finance);

    const { error } = await supabase.rpc("mark_release_seen", {
      p_release: "  ",
    });
    expect(error).not.toBeNull();
  });

  test("a brand-new row is stamped at the current release, so a first-time user gets the tour and not a changelog", async () => {
    const supabase = await signInAs(SEEDED_USERS.multi);
    touchedEmails.push(SEEDED_USERS.multi);
    // An account the portal has genuinely never seen.
    await deleteOnboarding((await userIdFor(SEEDED_USERS.multi))!);

    const { data } = await supabase.rpc("ensure_my_onboarding", {
      p_current_release: "2026-09-03",
    });
    const row = (
      data as {
        welcome_completed_at: string | null;
        last_release_seen: string | null;
      }[]
    )[0];

    expect(row.welcome_completed_at).toBeNull();
    expect(row.last_release_seen).toBe("2026-09-03");
  });

  test("an existing row keeps its release pointer across calls", async () => {
    const supabase = await signInAs(SEEDED_USERS.coordinator);
    touchedEmails.push(SEEDED_USERS.coordinator);
    await setOnboarding((await userIdFor(SEEDED_USERS.coordinator))!, {
      last_release_seen: "2026-09-03",
    });

    await supabase.rpc("ensure_my_onboarding", {
      p_current_release: "2026-12-25",
    });

    const row = await onboardingFor(SEEDED_USERS.coordinator);
    // Stamping happens on creation only -- otherwise every page load would
    // mark the newest release seen and nobody would ever see release notes.
    expect(row?.last_release_seen).toBe("2026-09-03");
  });

  test("an anonymous caller is rejected", async () => {
    const { error } = await anonClient().rpc("mark_release_seen", {
      p_release: "2026-09-03",
    });
    expect(error).not.toBeNull();
  });
});
