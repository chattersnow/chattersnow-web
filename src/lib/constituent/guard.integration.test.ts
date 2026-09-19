import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  removeModuleRow,
  seededTenantId,
  signIn,
} from "../../../test/integration-setup";
import { CONSTITUENT_MODULE } from "./guard";

/**
 * The two database-side halves of #1161: the module is off until a tenant asks
 * for it, and a signed-in person can find their own directory record on the
 * public site without holding a tenant membership.
 *
 * Both are the kind of claim a mocked client cannot check. The first is about
 * a resolution order written in SQL across three tables; the second is about
 * what a `security definer` function will and will not do for a caller whose
 * permissions are nil.
 */
describe("the constituent module is off until a tenant asks for it", () => {
  /**
   * "Said nothing" is a state the seeded tenant is not in: `supabase/seed.sql`
   * turns `constituent_accounts` on (#1175). These tests used to pass on the
   * back of an earlier file in the run deleting that row on its way out, which
   * made them a reading of the previous file's tidying up rather than of the
   * catalog -- and left the constituent area switched off locally afterwards
   * (#1282). So the absence they need is made here and given back here.
   */
  let restoreModule: () => Promise<void>;

  beforeAll(async () => {
    restoreModule = await removeModuleRow(
      await seededTenantId(),
      CONSTITUENT_MODULE,
    );
  });

  afterAll(async () => {
    await restoreModule();
  });

  // `module_enabled_for_tenant()` and `public_tenant_modules` both end their
  // coalesce chain with a fail-open `true`, which exists for a module key that
  // is not in the catalog at all. A catalog row saying `default_enabled =
  // false` has to beat it -- "fails open" and "defaults to off" sound like
  // they should collide, and the whole safety of shipping open sign-up before
  // #1162 rests on them not doing so.
  test("a tenant that has said nothing reads it as disabled", async () => {
    const { data, error } = await anonClient()
      .from("public_tenant_modules")
      .select("module_key, enabled")
      .eq("module_key", CONSTITUENT_MODULE)
      .single();

    expect(error).toBeNull();
    expect(data?.enabled).toBe(false);
  });

  test("and every other module is still on", async () => {
    const { data, error } = await anonClient()
      .from("public_tenant_modules")
      .select("module_key, enabled");

    expect(error).toBeNull();
    const off = (data ?? [])
      .filter((row) => row.enabled === false)
      .map((row) => row.module_key);
    expect(off).toEqual([CONSTITUENT_MODULE]);
  });

  test("it is in the catalog, not merely absent", async () => {
    // An unknown key would also read as "not enabled" through the app's
    // `moduleEnabled` helper -- by the opposite route, fail-open on a missing
    // row. Pinning the catalog row means the test above is measuring the
    // default and not a typo.
    const { data, error } = await adminClient
      .from("modules")
      .select("key, default_enabled, is_core")
      .eq("key", CONSTITUENT_MODULE)
      .single();

    expect(error).toBeNull();
    expect(data?.default_enabled).toBe(false);
    expect(data?.is_core).toBe(false);
  });
});

describe("my_public_person_id", () => {
  test("is not callable without a session", async () => {
    const { error } = await anonClient().rpc("my_public_person_id");
    expect(error).not.toBeNull();
  });

  test("answers with the caller's own directory record", async () => {
    const { data: personId, error } = await adminClient.rpc(
      "my_public_person_id",
    );
    expect(error).toBeNull();
    expect(personId).toBeTruthy();

    const { data: person } = await adminClient
      .from("people")
      .select("id, auth_user_id")
      .eq("id", personId as string)
      .single();

    const {
      data: { user },
    } = await adminClient.auth.getUser();
    expect(person?.auth_user_id).toBe(user!.id);
  });

  // The point of the function being a *reader*. resolve_current_person_id()
  // and ensure_current_person() both link an account to a record by email
  // match on the way past; that is the behaviour #1162 replaces with a
  // reviewed claim, so this path must find nothing rather than create the link
  // itself.
  test("does not link an account that has no record", async () => {
    const client = await signIn(SEEDED_USERS.noAccess);
    const {
      data: { user },
    } = await client.auth.getUser();

    const before = await adminClient
      .from("people")
      .select("id")
      .eq("auth_user_id", user!.id)
      .maybeSingle();

    const { data: personId, error } = await client.rpc("my_public_person_id");
    expect(error).toBeNull();

    const after = await adminClient
      .from("people")
      .select("id")
      .eq("auth_user_id", user!.id)
      .maybeSingle();

    // Whatever the seed gave this account, calling the function did not change
    // it -- and what comes back is that, not something newly minted.
    expect(after.data?.id ?? null).toBe(before.data?.id ?? null);
    expect(personId ?? null).toBe(before.data?.id ?? null);
  });
});
