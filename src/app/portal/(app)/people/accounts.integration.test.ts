import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  createPerson,
  serviceRoleClient,
  signIn,
  signInAs,
  uniqueEmail,
} from "../../../../../test/integration-setup";

/**
 * The Accounts segment and the unlink behind it (#1193).
 *
 * Both rest on things that cannot be checked without a database: a computed
 * column that is `security definer` and therefore gated in its own body, and an
 * RPC whose whole job is to refuse three different callers.
 *
 * The module fixture is `claims.integration.test.ts`'s, and so is the tidying
 * up: turn `constituent_accounts` on for the duration, take the row away again
 * afterwards, and delete the accounts this file made. Both halves matter to
 * files that run later in the same process -- `guard.integration.test.ts` reads
 * "a tenant that has said nothing" off the absence of that row, and the seeded
 * users have to stay inside the first page `auth.admin.listUsers()` returns,
 * which is how several finance tests find `finance@example.test`.
 */
const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);

let tenantId: string;

// Stated rather than assumed: `constituent_accounts` is the one module that
// defaults to off (20260916050000), and `has_permission()` folds the module
// check in -- so with it off, every assertion below would fail for a reason
// that has nothing to do with what it is testing.
beforeAll(async () => {
  const { data: tenant } = await service
    .from("tenants")
    .select("id")
    .eq("slug", "example-nonprofit")
    .single();
  tenantId = tenant!.id as string;
  const { error } = await service.from("tenant_modules").upsert(
    {
      tenant_id: tenantId,
      module_key: "constituent_accounts",
      enabled: true,
    },
    { onConflict: "tenant_id,module_key" },
  );
  if (error) throw new Error(`enable module: ${error.message}`);
});

afterAll(async () => {
  await service
    .from("tenant_modules")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("module_key", "constituent_accounts");
});

const cleanups: Array<() => Promise<void>> = [];
const createdUsers: string[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
  // The people rows go first: `people.auth_user_id` references these. Unlike
  // `claims.integration.test.ts`, which leaves its accounts behind because
  // `person_claims` rows point at them, nothing here outlives the test -- and
  // every account left behind pushes a seeded one off the first page of
  // `auth.admin.listUsers()`, which other suites rely on to find their users.
  while (createdUsers.length) {
    await service.auth.admin.deleteUser(createdUsers.pop()!);
  }
});

/**
 * An account with no `tenant_memberships` row -- the shape an approved claim
 * leaves behind, and the one that must never be able to read the portal's side
 * of any of this. Built by hand for the same reason `claims.integration.test.ts`
 * builds it by hand: every seeded user is a member of the tenant.
 */
async function makeConstituent(tag: string) {
  const email = uniqueEmail(`${tag}-${run}`);
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });
  if (error) throw error;
  createdUsers.push(data.user!.id);
  return { email, userId: data.user!.id, client: await signIn(email) };
}

/** A person row linked to a brand-new account with no role anywhere. */
async function personWithWebsiteAccount(tag: string, recordEmail?: string) {
  const constituent = await makeConstituent(tag);
  const person = await createPerson(
    recordEmail ? { email: recordEmail } : undefined,
  );
  cleanups.push(person.cleanup);
  const { error } = await adminClient
    .from("people")
    .update({ auth_user_id: constituent.userId })
    .eq("id", person.id);
  expect(error).toBeNull();
  return { ...person, account: constituent };
}

describe("the Accounts segment's read", () => {
  test("account_email names the address a claims reviewer needs", async () => {
    const recordEmail = uniqueEmail(`record-${run}`);
    const linked = await personWithWebsiteAccount("signs-in-as", recordEmail);
    const unlinked = await createPerson();
    cleanups.push(unlinked.cleanup);

    const { data, error } = await adminClient
      .from("people_with_roles")
      .select("id, email, account_email, has_account")
      .in("id", [linked.id, unlinked.id]);
    expect(error).toBeNull();

    const linkedRow = (data ?? []).find((row) => row.id === linked.id);
    // The point of the column: the record and the account are different
    // addresses, and only one of them is in the directory.
    expect(linkedRow).toMatchObject({
      email: recordEmail,
      account_email: linked.account.email,
      has_account: true,
    });

    const unlinkedRow = (data ?? []).find((row) => row.id === unlinked.id);
    expect(unlinkedRow).toMatchObject({
      account_email: null,
      has_account: false,
    });
  });

  // The whole reason it is a definer function rather than a join: a reader who
  // may see the directory is not thereby allowed to see who can sign in.
  test("it is null for a reader without constituent_claims", async () => {
    const linked = await personWithWebsiteAccount("no-claims-permission");

    const coordinator = await signInAs(SEEDED_USERS.coordinator);
    const { data, error } = await coordinator
      .from("people_with_roles")
      .select("id, account_email, has_account")
      .eq("id", linked.id)
      .single();
    expect(error).toBeNull();
    // They can still see *that* there is an account, which is what the badge
    // beside the person's name has always said. Not what it signs in as.
    expect(data).toMatchObject({ has_account: true, account_email: null });
  });

  test("has_account is the filter the segment runs", async () => {
    const linked = await personWithWebsiteAccount("filtered");
    const unlinked = await createPerson();
    cleanups.push(unlinked.cleanup);

    const { data, error } = await adminClient
      .from("people_with_roles")
      .select("id")
      .in("id", [linked.id, unlinked.id])
      .eq("has_account", true);
    expect(error).toBeNull();
    expect((data ?? []).map((row) => row.id)).toEqual([linked.id]);
  });

  test("a constituent reads none of the directory it is listed in", async () => {
    const linked = await personWithWebsiteAccount("own-row");

    const { data, error } = await linked.account.client
      .from("people_with_roles")
      .select("id, account_email")
      .eq("id", linked.id);
    // No membership means no current_tenant_id(), so the view is empty rather
    // than refused -- the same answer #1161 gives everywhere else.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("unlink_person_account", () => {
  test("detaches a website account and leaves a trail", async () => {
    const linked = await personWithWebsiteAccount("unlink-me");

    const { error } = await adminClient.rpc("unlink_person_account", {
      p_person_id: linked.id,
    });
    expect(error).toBeNull();

    const { data: after } = await service
      .from("people")
      .select("auth_user_id")
      .eq("id", linked.id)
      .single();
    expect(after?.auth_user_id).toBeNull();

    // `people` carries no audit trigger on purpose (20260916080000), so the
    // RPC writes the row itself -- naming the account it detached, and nothing
    // else about the person.
    const { data: audit } = await service
      .from("audit_log")
      .select("action, actor_id, old_data, new_data")
      .eq("table_name", "people")
      .eq("record_id", linked.id);
    expect(audit).toHaveLength(1);
    expect(audit![0]).toMatchObject({
      action: "update",
      old_data: { auth_user_id: linked.account.userId },
      new_data: { auth_user_id: null },
    });
  });

  test("refuses an account that can open the portal", async () => {
    // The admin's own record: an account with a role behind it.
    const {
      data: { user },
    } = await adminClient.auth.getUser();
    const { data: staffPerson } = await adminClient
      .from("people")
      .select("id")
      .eq("auth_user_id", user!.id)
      .single();

    const { error } = await adminClient.rpc("unlink_person_account", {
      p_person_id: staffPerson!.id,
    });
    expect(error?.message).toContain("Administration");

    const { data: after } = await service
      .from("people")
      .select("auth_user_id")
      .eq("id", staffPerson!.id)
      .single();
    expect(after?.auth_user_id).toBe(user!.id);
  });

  test("refuses a record with no account", async () => {
    const person = await createPerson();
    cleanups.push(person.cleanup);

    const { error } = await adminClient.rpc("unlink_person_account", {
      p_person_id: person.id,
    });
    expect(error?.message).toContain("no account");
  });

  test("refuses a reader who does not review claims", async () => {
    const linked = await personWithWebsiteAccount("not-yours");

    const coordinator = await signInAs(SEEDED_USERS.coordinator);
    const { error } = await coordinator.rpc("unlink_person_account", {
      p_person_id: linked.id,
    });
    expect(error?.message).toContain("Not authorized");

    const { data: after } = await service
      .from("people")
      .select("auth_user_id")
      .eq("id", linked.id)
      .single();
    expect(after?.auth_user_id).toBe(linked.account.userId);
  });

  test("refuses a constituent asking about their own record", async () => {
    const linked = await personWithWebsiteAccount("self-service");

    const { error } = await linked.account.client.rpc("unlink_person_account", {
      p_person_id: linked.id,
    });
    expect(error).not.toBeNull();

    const { data: after } = await service
      .from("people")
      .select("auth_user_id")
      .eq("id", linked.id)
      .single();
    expect(after?.auth_user_id).toBe(linked.account.userId);
  });
});
