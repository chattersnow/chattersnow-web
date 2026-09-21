// The publication history of a legal document (#601), against a real stack.
//
// Mocks cannot answer what this file exists for. The table's whole value is
// that a row, once written, is what was served and stays that way -- which is
// a grant-and-policy claim ("no session can insert, update or delete one") and
// a transaction claim ("a publish that succeeded left a version behind"), and
// neither survives a mocked client.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  adminClient,
  anonClient,
  serviceRoleClient,
} from "../../test/integration-setup";

const service = serviceRoleClient();

const SLOT = "legal.privacy";
const DOCUMENT = "privacy";

const document = (marker: string) => ({
  title: "Privacy Policy",
  last_updated: `${marker} 2026`,
  summary: [`Summary ${marker}.`],
  sections: [{ id: "scope", title: "Scope", paragraphs: [marker] }],
});

async function versions() {
  const { data } = await service
    .from("legal_document_versions")
    .select("version, content, surfaces, time_zone, created_by, effective_at")
    .eq("document", DOCUMENT)
    .order("version", { ascending: true });
  return data ?? [];
}

async function publish(surfaces?: string[]) {
  return adminClient.rpc("publish_site_content", {
    p_keys: [SLOT],
    p_legal_surface: surfaces ? { surfaces } : undefined,
  });
}

async function draft(value: unknown) {
  const { error } = await adminClient.rpc("save_site_content_drafts", {
    p_entries: [{ key: SLOT, value }],
  });
  expect(error).toBeNull();
}

// Cleanup as service_role: nothing else can remove either row. The seed
// publishes no legal document, so the slot starts and ends absent -- and the
// history is cleared going in as well as coming out, since any other file in
// the run that publishes a legal slot leaves versions behind by design.
beforeEach(clear);
afterEach(clear);

async function clear() {
  await service
    .from("legal_document_versions")
    .delete()
    .eq("document", DOCUMENT);
  await service.from("site_content").delete().eq("key", SLOT);
}

describe("publishing a legal document", () => {
  test("writes a version per publish, numbered in order", async () => {
    await draft(document("First,"));
    expect((await publish(["contact_form"])).error).toBeNull();

    await draft(document("Second,"));
    expect(
      (await publish(["contact_form", "volunteer_form"])).error,
    ).toBeNull();

    const history = await versions();
    expect(history.map((row) => row.version)).toEqual([1, 2]);
    // The snapshot is a copy: version 1 still says what it said after the
    // second publish replaced the live text.
    expect(history[0].content).toEqual(document("First,"));
    expect(history[1].content).toEqual(document("Second,"));
    // And it carries the collection surface it was published against (#1292),
    // per version rather than only for the current document.
    expect(history[0].surfaces).toEqual(["contact_form"]);
    expect(history[1].surfaces).toEqual(["contact_form", "volunteer_form"]);
    expect(history[0].created_by).not.toBeNull();
    expect(history[0].time_zone).toBeTruthy();
  });

  test("adds nothing when the publish publishes nothing", async () => {
    await draft(document("Only,"));
    await publish();
    // A caller may name a slot with no pending draft. A second version here
    // would claim the organization republished on a day it did nothing.
    const { data: count } = await adminClient.rpc("publish_site_content", {
      p_keys: [SLOT],
    });
    expect(count).toBe(0);
    expect((await versions()).map((row) => row.version)).toEqual([1]);
  });

  test("records no version when a document goes back to the platform's", async () => {
    await draft(document("Ours,"));
    await publish();
    // Publishing a NULL hands the route back to the platform's default. That
    // is the absence of a version, not a version of nothing.
    await draft(null);
    expect((await publish()).error).toBeNull();
    expect((await versions()).map((row) => row.version)).toEqual([1]);
  });
});

describe("the history is append-only", () => {
  test("no session can write, change or remove a version", async () => {
    await draft(document("Published,"));
    await publish();
    const [row] = await versions();

    const insert = await adminClient.from("legal_document_versions").insert({
      document: DOCUMENT,
      version: 99,
      content: document("Forged,"),
    });
    expect(insert.error).not.toBeNull();

    const update = await adminClient
      .from("legal_document_versions")
      .update({ content: document("Rewritten,") })
      .eq("version", row.version)
      .eq("document", DOCUMENT);
    // No update policy at all, so this is refused rather than silently
    // matching nothing -- but assert the text either way, which is the claim
    // that matters.
    expect(update.error).not.toBeNull();

    await adminClient
      .from("legal_document_versions")
      .delete()
      .eq("document", DOCUMENT);

    const after = await versions();
    expect(after).toHaveLength(1);
    expect(after[0].content).toEqual(document("Published,"));
  });
});

describe("what the public site can read", () => {
  test("anon reads every version, and never the surface", async () => {
    await draft(document("First,"));
    await publish(["contact_form"]);
    await draft(document("Second,"));
    await publish(["contact_form"]);

    const { data, error } = await anonClient()
      .from("public_legal_document_versions")
      .select("document, version, content, effective_at, time_zone")
      .eq("document", DOCUMENT)
      .order("version", { ascending: false });
    expect(error).toBeNull();
    expect(data?.map((row) => row.version)).toEqual([2, 1]);
    expect(data?.[1].content).toEqual(document("First,"));

    // `surfaces` is what the tenant's own site collects, and is not the
    // public's business: it is absent from the view, so asking for it fails.
    const surfaces = await anonClient()
      .from("public_legal_document_versions")
      .select("surfaces");
    expect(surfaces.error).not.toBeNull();
  });
});
