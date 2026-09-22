import { afterAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  anonClient,
  SEEDED_USERS,
  signInAs,
  unprivilegedActors,
} from "../../test/integration-setup";

/**
 * `set_giving_settings()` is what actually publishes a URL onto a public page
 * (#1389), so the checks that matter are the ones a panel cannot make: who may
 * write, and what the database refuses whatever the client sent.
 */

const GIVING_KEYS = [
  "giving.enabled",
  "giving.provider_label",
  "giving.url",
  "giving.mode",
  "giving.suggested_amounts",
  "giving.amount_param",
  "giving.recurring_available",
];

type GivingArgs = {
  p_enabled: boolean;
  p_provider_label: string;
  p_url: string;
  p_mode: string;
  p_suggested_amounts: number[];
  p_amount_param: string;
  p_recurring_available: boolean;
};

const OFF: GivingArgs = {
  p_enabled: false,
  p_provider_label: "",
  p_url: "",
  p_mode: "link",
  p_suggested_amounts: [],
  p_amount_param: "",
  p_recurring_available: false,
};

async function setGiving(
  client: Awaited<typeof adminClient>,
  overrides: Partial<GivingArgs> = {},
) {
  return client.rpc("set_giving_settings", { ...OFF, ...overrides });
}

afterAll(async () => {
  // Back to off. `app_settings` has no delete policy, so the rows stay --
  // which is fine, since "off with nothing configured" is exactly the state
  // the seeded tenant starts in and what every other suite expects to read.
  await setGiving(await signInAs(SEEDED_USERS.finance));
});

describe("set_giving_settings", () => {
  test("is refused to everyone without finance:manage", async () => {
    for (const actor of await unprivilegedActors()) {
      const { error } = await setGiving(actor.client);
      expect(error, actor.name).not.toBeNull();
    }
    // A coordinator runs events and books event spend; the giving path is not
    // theirs (docs/permissions.md).
    const { error } = await setGiving(await signInAs(SEEDED_USERS.coordinator));
    expect(error).not.toBeNull();
  });

  test("is allowed to finance:manage, and writes all seven keys", async () => {
    const finance = await signInAs(SEEDED_USERS.finance);
    const { error } = await setGiving(finance, {
      p_enabled: true,
      p_provider_label: "Givebutter",
      p_url: "https://givebutter.com/example",
      p_suggested_amounts: [25, 50],
      p_amount_param: "amount",
      p_recurring_available: true,
    });
    expect(error).toBeNull();

    const { data } = await adminClient
      .from("app_settings")
      .select("key, value")
      .in("key", GIVING_KEYS);
    expect(data).toHaveLength(7);
  });

  // The whole reason the checks are repeated in the database: a raw PostgREST
  // call skips every line of the panel.
  test("refuses a URL the public site must never carry", async () => {
    const finance = await signInAs(SEEDED_USERS.finance);
    for (const url of [
      "javascript:alert(1)",
      "http://givebutter.com/example",
      "https://user:pass@givebutter.com/example",
      "https://localhost/donate",
      `https://givebutter.com/${"a".repeat(500)}`,
    ]) {
      const { error } = await setGiving(finance, { p_url: url });
      expect(error?.message, url).toBeTruthy();
    }
  });

  test("refuses being switched on with nothing to point at", async () => {
    const finance = await signInAs(SEEDED_USERS.finance);
    const { error } = await setGiving(finance, { p_enabled: true, p_url: "" });
    expect(error?.message).toBe("GIVING_URL_REQUIRED");
  });

  test("refuses amounts that are not whole, positive and few", async () => {
    const finance = await signInAs(SEEDED_USERS.finance);
    for (const amounts of [[12.5], [-5], [0], [1, 2, 3, 4, 5, 6, 7], [1e9]]) {
      const { error } = await setGiving(finance, {
        p_url: "https://givebutter.com/example",
        p_suggested_amounts: amounts,
      });
      expect(error?.message, JSON.stringify(amounts)).toBe(
        "GIVING_AMOUNTS_INVALID",
      );
    }
  });

  test("refuses an amount parameter that is not a parameter name", async () => {
    const finance = await signInAs(SEEDED_USERS.finance);
    const { error } = await setGiving(finance, {
      p_url: "https://givebutter.com/example",
      p_amount_param: "amount=1&redirect",
    });
    expect(error?.message).toBe("GIVING_AMOUNT_PARAM_INVALID");
  });

  test("refuses a mode that is neither a link nor an embed", async () => {
    const finance = await signInAs(SEEDED_USERS.finance);
    const { error } = await setGiving(finance, { p_mode: "iframe" });
    expect(error?.message).toBe("GIVING_MODE_INVALID");
  });
});

describe("get_giving_settings", () => {
  test("answers null to a session without finance:view", async () => {
    const { data } = await (
      await signInAs(SEEDED_USERS.volunteer)
    ).rpc("get_giving_settings");
    expect(data).toBeNull();
  });

  test("is unreachable to anon", async () => {
    const { error } = await anonClient().rpc("get_giving_settings");
    expect(error).not.toBeNull();
  });
});

describe("public_giving_settings", () => {
  test("withholds every value but the switch while giving is off", async () => {
    await setGiving(await signInAs(SEEDED_USERS.finance), {
      p_enabled: false,
      p_url: "https://givebutter.com/not-announced-yet",
      p_provider_label: "Givebutter",
    });

    const { data } = await anonClient()
      .from("public_giving_settings")
      .select("slot, value");
    const bySlot = new Map(
      (data ?? []).map((row) => [row.slot as string, row.value]),
    );
    expect(bySlot.get("enabled")).toBe(false);
    expect(bySlot.get("url")).toBe("");
    expect(bySlot.get("provider_label")).toBe("");
  });

  test("hands the public site what it needs once giving is on", async () => {
    await setGiving(await signInAs(SEEDED_USERS.finance), {
      p_enabled: true,
      p_url: "https://givebutter.com/example",
      p_provider_label: "Givebutter",
      p_suggested_amounts: [25],
      p_amount_param: "amount",
    });

    const { data } = await anonClient()
      .from("public_giving_settings")
      .select("slot, value");
    const bySlot = new Map(
      (data ?? []).map((row) => [row.slot as string, row.value]),
    );
    expect(bySlot.get("enabled")).toBe(true);
    expect(bySlot.get("url")).toBe("https://givebutter.com/example");
    expect(bySlot.get("suggested_amounts")).toEqual([25]);
  });

  test("is select-only for anon", async () => {
    const { error } = await anonClient()
      .from("public_giving_settings")
      .insert({ slot: "enabled", value: true });
    expect(error).not.toBeNull();
  });
});
