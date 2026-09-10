// Integration coverage for the per-tenant sender identity (#857) against a
// real local Supabase stack.
//
// identity.test.ts already pins the rules down; what only a database can show
// is that tenantMailContext() reads the rows it means to -- tenants.name and
// tenants.custom_domain by id, and app_settings scoped to an explicit tenant_id
// rather than to current_tenant_id(), which is null for the service-role
// caller this runs as.
//
// The case that earns this file is the last one: a tenant configured to send
// from a verified domain it does not own must be ignored. That is the whole
// reason the check is not a verified-domain check alone, and it needs no
// second tenant to demonstrate -- only a verified domain and a tenant that
// isn't it.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { serviceRoleClient } from "../../../test/integration-setup";
import {
  FROM_ADDRESS_SETTING_KEY,
  REPLY_TO_SETTING_KEY,
  tenantMailContext,
} from "./identity";

const FALLBACK_ORIGIN = "https://platform.test";

/** The reader answers identity and origin together (#860); most cases want the identity. */
const identityFor = async (tenantId: string) =>
  (
    await tenantMailContext(service, tenantId, {
      fallbackOrigin: FALLBACK_ORIGIN,
    })
  ).identity;

const service = serviceRoleClient();

const PLATFORM_FROM = "notifications@platform.test";
const originalFrom = process.env.EMAIL_FROM;
const originalReplyTo = process.env.EMAIL_REPLY_TO;
const originalVerified = process.env.EMAIL_VERIFIED_DOMAINS;

let tenantId: string;
let tenantName: string;
let originalDomain: string | null;

async function setSetting(key: string, value: unknown) {
  const { error } = await service
    .from("app_settings")
    .upsert(
      { tenant_id: tenantId, key, value },
      { onConflict: "tenant_id,key" },
    );
  if (error) throw new Error(`${key}: ${error.message}`);
}

async function setCustomDomain(domain: string | null) {
  const { error } = await service
    .from("tenants")
    .update({ custom_domain: domain })
    .eq("id", tenantId);
  if (error) throw new Error(`custom_domain: ${error.message}`);
}

beforeAll(async () => {
  // The oldest existing tenant, the way task-digest-job.integration.test.ts
  // does it. Provisioning a second one would take the public site down for
  // anything running beside this (see #795), and nothing here needs two.
  const { data, error } = await service
    .from("tenants")
    .select("id, name, custom_domain")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (error) throw new Error(`tenant: ${error.message}`);

  tenantId = data.id as string;
  tenantName = data.name as string;
  originalDomain = (data.custom_domain as string) ?? null;

  process.env.EMAIL_FROM = PLATFORM_FROM;
  delete process.env.EMAIL_REPLY_TO;
  delete process.env.EMAIL_VERIFIED_DOMAINS;
});

afterEach(async () => {
  // "" rather than a delete: app_settings has no delete grant, and an empty
  // value is how the readers are told "unset".
  await setSetting(REPLY_TO_SETTING_KEY, "");
  await setSetting(FROM_ADDRESS_SETTING_KEY, "");
  await setCustomDomain(originalDomain);
  delete process.env.EMAIL_VERIFIED_DOMAINS;
  delete process.env.EMAIL_REPLY_TO;
});

afterAll(async () => {
  await setCustomDomain(originalDomain);
  if (originalFrom === undefined) delete process.env.EMAIL_FROM;
  else process.env.EMAIL_FROM = originalFrom;
  if (originalReplyTo === undefined) delete process.env.EMAIL_REPLY_TO;
  else process.env.EMAIL_REPLY_TO = originalReplyTo;
  if (originalVerified === undefined) delete process.env.EMAIL_VERIFIED_DOMAINS;
  else process.env.EMAIL_VERIFIED_DOMAINS = originalVerified;
});

describe("tenantMailContext", () => {
  test("names the tenant on the platform address when nothing is configured", async () => {
    const identity = await identityFor(tenantId);

    expect(identity.from).toBe(`"${tenantName}" <${PLATFORM_FROM}>`);
    expect(identity).not.toHaveProperty("replyTo");
  });

  test("reads the tenant's own Reply-To", async () => {
    await setSetting(REPLY_TO_SETTING_KEY, "board@example.test");

    expect((await identityFor(tenantId)).replyTo).toBe("board@example.test");
  });

  test("falls back to EMAIL_REPLY_TO when the tenant has set none", async () => {
    process.env.EMAIL_REPLY_TO = "hello@platform.test";

    expect((await identityFor(tenantId)).replyTo).toBe("hello@platform.test");
  });

  test("sends from the tenant's own verified domain", async () => {
    await setCustomDomain("mail-identity-test.example");
    process.env.EMAIL_VERIFIED_DOMAINS = "mail-identity-test.example";
    await setSetting(
      FROM_ADDRESS_SETTING_KEY,
      "hello@mail-identity-test.example",
    );

    expect((await identityFor(tenantId)).from).toBe(
      `"${tenantName}" <hello@mail-identity-test.example>`,
    );
  });

  test("ignores a verified domain the tenant does not own", async () => {
    // The impersonation case. Anyone holding system_settings:manage can write
    // this row -- updateAppSettingAction takes a free-form key -- so the send
    // path, not the save path, is what has to refuse it.
    await setCustomDomain("mail-identity-test.example");
    process.env.EMAIL_VERIFIED_DOMAINS = "someone-elses-domain.example";
    await setSetting(
      FROM_ADDRESS_SETTING_KEY,
      "billing@someone-elses-domain.example",
    );

    expect((await identityFor(tenantId)).from).toBe(
      `"${tenantName}" <${PLATFORM_FROM}>`,
    );
  });

  test("ignores the tenant's own domain until the operator verifies it", async () => {
    await setCustomDomain("mail-identity-test.example");
    process.env.EMAIL_VERIFIED_DOMAINS = "platform.test";
    await setSetting(
      FROM_ADDRESS_SETTING_KEY,
      "hello@mail-identity-test.example",
    );

    expect((await identityFor(tenantId)).from).toBe(
      `"${tenantName}" <${PLATFORM_FROM}>`,
    );
  });
});

describe("tenantMailContext origin (#860)", () => {
  test("resolves the tenant's own site from custom_domain", async () => {
    await setCustomDomain("mail-identity-test.example");

    const { origin } = await tenantMailContext(service, tenantId, {
      fallbackOrigin: FALLBACK_ORIGIN,
    });

    expect(origin).toBe("https://mail-identity-test.example");
  });

  test("falls back to the platform origin when the tenant has no domain", async () => {
    await setCustomDomain(null);

    const { origin } = await tenantMailContext(service, tenantId, {
      fallbackOrigin: FALLBACK_ORIGIN,
    });

    expect(origin).toBe(FALLBACK_ORIGIN);
  });
});
