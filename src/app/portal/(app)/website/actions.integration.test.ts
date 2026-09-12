// The draft/publish split for site content (#793), against a real stack.
//
// Mocks cannot answer the question this file exists for: whether a session
// holding `site_content:manage` can reach `site_content.value` any way other
// than `publish_site_content`. That is a column-privilege and RLS question,
// and the whole design -- including the approval gate the legal documents get
// on top of it -- rests on the answer being no.
import { afterEach, describe, expect, test } from "bun:test";
import {
  adminClient,
  anonClient,
  serviceRoleClient,
  signInAs,
  SEEDED_USERS,
} from "../../../../../test/integration-setup";

// Cleanup runs as service_role: `authenticated` cannot delete a published row
// at all, which is the property half this file exists to assert.
const service = serviceRoleClient();

const KEY = "home.heading";

async function currentRow() {
  const { data } = await adminClient
    .from("site_content")
    .select("value, draft_value, has_draft, published_at, published_by")
    .eq("key", KEY)
    .maybeSingle();
  return data;
}

afterEach(async () => {
  await service.from("site_content").delete().eq("key", KEY);
});

describe("saving a draft", () => {
  test("stages the copy without changing what the public site serves", async () => {
    // Read what is published first rather than assuming nothing is: since #795
    // rollout step 3 the seeded tenant owns its copy, so this slot arrives with
    // a published value. "Unchanged" is the claim either way, and asserting it
    // that way is what makes the test true of a published slot and an unwritten
    // one alike.
    const before = await currentRow();
    const publishedBefore = before?.value ?? null;

    const { error } = await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: KEY, value: "A draft heading" }],
    });
    expect(error).toBeNull();

    const row = await currentRow();
    expect(row?.has_draft).toBe(true);
    expect(row?.draft_value).toBe("A draft heading");
    expect(row?.value ?? null).toEqual(publishedBefore);

    const { data: publicRows } = await anonClient()
      .from("public_site_content")
      .select("key, value")
      .eq("key", KEY);
    expect(publicRows).toEqual(
      publishedBefore === null ? [] : [{ key: KEY, value: publishedBefore }],
    );
  });

  test("stamps who drafted it, whatever the caller sends", async () => {
    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: KEY, value: "A draft heading" }],
    });

    const { data } = await adminClient
      .from("site_content")
      .select("draft_updated_by, draft_updated_at")
      .eq("key", KEY)
      .single();
    const { data: user } = await adminClient.auth.getUser();
    // Not a column the browser fills in: the four-eyes rule the legal
    // approval gate needs would be worthless if the drafter could set it.
    expect(data?.draft_updated_by).toBe(user.user!.id);
    expect(data?.draft_updated_at).not.toBeNull();
  });
});

describe("publishing", () => {
  test("moves the draft onto the public site and records who did it", async () => {
    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: KEY, value: "A published heading" }],
    });
    const { error } = await adminClient.rpc("publish_site_content", {
      p_keys: [KEY],
    });
    expect(error).toBeNull();

    const row = await currentRow();
    expect(row?.value).toBe("A published heading");
    expect(row?.has_draft).toBe(false);
    expect(row?.draft_value).toBeNull();
    expect(row?.published_at).not.toBeNull();
    const { data: user } = await adminClient.auth.getUser();
    expect(row?.published_by).toBe(user.user!.id);
  });

  test("a draft of null takes the slot back to the registry default", async () => {
    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: KEY, value: "Our own words" }],
    });
    await adminClient.rpc("publish_site_content", { p_keys: [KEY] });

    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: KEY, value: null }],
    });
    await adminClient.rpc("publish_site_content", { p_keys: [KEY] });

    // The row stays, so the revert keeps an author and a date, but the public
    // view stops serving it and the page renders the shipped copy again.
    const row = await currentRow();
    expect(row?.value).toBeNull();
    expect(row?.published_at).not.toBeNull();
    const { data: publicRows } = await anonClient()
      .from("public_site_content")
      .select("key")
      .eq("key", KEY);
    expect(publicRows).toEqual([]);
  });

  test("publishing nothing is not an error", async () => {
    const { error } = await adminClient.rpc("publish_site_content", {
      p_keys: [],
    });
    expect(error).toBeNull();
  });
});

describe("publishing cannot be reached any other way", () => {
  test("an authenticated session cannot write `value` directly", async () => {
    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: KEY, value: "A draft heading" }],
    });

    const { error } = await adminClient
      .from("site_content")
      .update({ value: "Published behind the flow's back" })
      .eq("key", KEY);

    // 42501 is Postgres's insufficient_privilege: the column grant, not RLS.
    expect(error?.code).toBe("42501");
    expect((await currentRow())?.value).toBeNull();
  });

  test("an authenticated session cannot insert a published row", async () => {
    const { error } = await adminClient
      .from("site_content")
      .insert({ key: KEY, value: "Straight to the site" });

    expect(error?.code).toBe("42501");
  });

  test("an authenticated session cannot forge the publisher", async () => {
    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: KEY, value: "A draft heading" }],
    });

    const { error } = await adminClient
      .from("site_content")
      .update({ published_by: null })
      .eq("key", KEY);

    expect(error?.code).toBe("42501");
  });
});

describe("permissions", () => {
  test("a session without site_content:manage cannot save or publish", async () => {
    const volunteer = await signInAs(SEEDED_USERS.volunteer);

    const save = await volunteer.rpc("save_site_content_drafts", {
      p_entries: [{ key: KEY, value: "Not mine to write" }],
    });
    expect(save.error?.message).toContain("FORBIDDEN");

    const publish = await volunteer.rpc("publish_site_content", {
      p_keys: [KEY],
    });
    expect(publish.error?.message).toContain("FORBIDDEN");
  });

  test("a signed-out visitor cannot call the publish functions at all", async () => {
    const { error } = await anonClient().rpc("publish_site_content", {
      p_keys: [KEY],
    });
    expect(error).not.toBeNull();
  });
});

// The photos are slots in this table since #812, and the public pages read
// them through `public_site_images` -- so a photo, like a sentence, must be
// invisible to the site while it is only a draft and gone again when the slot
// is published back to its default.
describe("image slots", () => {
  const IMAGE_KEY = "site_images.gear_placeholder";
  const URL = "https://example.test/gear.jpg";

  async function publicImage() {
    const { data, error } = await anonClient()
      .from("public_site_images")
      .select("slot, value")
      .eq("slot", "gear_placeholder");
    if (error) throw error;
    return data;
  }

  afterEach(async () => {
    await service.from("site_content").delete().eq("key", IMAGE_KEY);
  });

  test("a drafted photo is not on the site until it is published", async () => {
    const { error } = await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: IMAGE_KEY, value: URL }],
    });
    expect(error).toBeNull();
    expect(await publicImage()).toEqual([]);

    await adminClient.rpc("publish_site_content", { p_keys: [IMAGE_KEY] });
    expect(await publicImage()).toEqual([
      { slot: "gear_placeholder", value: URL },
    ]);

    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: IMAGE_KEY, value: null }],
    });
    await adminClient.rpc("publish_site_content", { p_keys: [IMAGE_KEY] });
    expect(await publicImage()).toEqual([]);
  });

  test("nothing is left in app_settings, where the photos used to live", async () => {
    const { data, error } = await service
      .from("app_settings")
      .select("key")
      .like("key", "site_images.%");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("discarding a draft", () => {
  test("leaves the published copy in place", async () => {
    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: KEY, value: "Published" }],
    });
    await adminClient.rpc("publish_site_content", { p_keys: [KEY] });
    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: KEY, value: "Second thoughts" }],
    });

    await adminClient.rpc("discard_site_content_drafts", { p_keys: [KEY] });

    const row = await currentRow();
    expect(row?.value).toBe("Published");
    expect(row?.has_draft).toBe(false);
    expect(row?.draft_value).toBeNull();
  });

  test("removes a slot that was only ever a draft", async () => {
    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: KEY, value: "Never published" }],
    });

    await adminClient.rpc("discard_site_content_drafts", { p_keys: [KEY] });

    expect(await currentRow()).toBeNull();
  });
});
