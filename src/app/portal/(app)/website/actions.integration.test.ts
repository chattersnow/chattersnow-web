// The draft/publish split for site content (#793), against a real stack.
//
// Mocks cannot answer the question this file exists for: whether a session
// holding `site_content:manage` can reach `site_content.value` any way other
// than `publish_site_content`. That is a column-privilege and RLS question,
// and the whole design -- including the approval gate the legal documents get
// on top of it -- rests on the answer being no.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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

// #1292. The fingerprint is written by `publish_site_content` rather than by
// the Server Action afterwards, and that is the whole point: two transactions
// would let the publish succeed while the fingerprint write failed, leaving the
// document reading as *unknown* forever with nothing left to retry it. Only a
// real stack can show that the two land together, and that a caller naming a
// slot with nothing pending does not get a fresh stamp on stale text.
describe("the legal-document surface fingerprint", () => {
  const LEGAL_KEY = "legal.privacy";
  const SETTING_KEY = "legal_surface.privacy";
  const SURFACE = { surfaces: ["artworkSubmissions", "contact"] };

  // `legal.privacy` is a real slot this tenant may already be serving, so the
  // row is put back rather than deleted.
  let before: { value: unknown } | null = null;

  beforeEach(async () => {
    const { data } = await service
      .from("site_content")
      .select("value")
      .eq("key", LEGAL_KEY)
      .maybeSingle();
    before = data ?? null;
  });

  afterEach(async () => {
    if (before) {
      await service
        .from("site_content")
        .update({ value: before.value, draft_value: null, has_draft: false })
        .eq("key", LEGAL_KEY);
    } else {
      await service.from("site_content").delete().eq("key", LEGAL_KEY);
    }
    await service.from("app_settings").delete().eq("key", SETTING_KEY);
    // Publishing a legal slot appends a version row (#601), which nothing
    // else here removes -- the table has no delete policy at all.
    await service
      .from("legal_document_versions")
      .delete()
      .eq("document", "privacy");
  });

  async function fingerprint() {
    const { data } = await service
      .from("app_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();
    return (data?.value ?? null) as {
      surfaces?: string[];
      published_at?: string;
    } | null;
  }

  test("records what the site collected, stamped with the publish itself", async () => {
    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: LEGAL_KEY, value: "Our own privacy policy" }],
    });
    const { error } = await adminClient.rpc("publish_site_content", {
      p_keys: [LEGAL_KEY],
      p_legal_surface: SURFACE,
    });
    expect(error).toBeNull();

    const stored = await fingerprint();
    expect(stored?.surfaces).toEqual(["artworkSubmissions", "contact"]);
    // The transaction's own clock, not the caller's: a browser that is a week
    // out would otherwise date the document a week out.
    expect(Date.parse(stored!.published_at!)).toBeGreaterThan(
      Date.now() - 60_000,
    );
  });

  test("writes nothing for a slot that is not a legal document", async () => {
    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: KEY, value: "An ordinary heading" }],
    });
    await adminClient.rpc("publish_site_content", {
      p_keys: [KEY],
      p_legal_surface: SURFACE,
    });

    expect(await fingerprint()).toBeNull();
  });

  // The feature's own failure mode, written by its own hand: a caller may name
  // a slot with no pending draft, nothing publishes, and stamping it anyway
  // would mark text that never changed as freshly checked.
  test("writes nothing when the document did not actually publish", async () => {
    await adminClient.rpc("publish_site_content", {
      p_keys: [LEGAL_KEY],
      p_legal_surface: SURFACE,
    });

    expect(await fingerprint()).toBeNull();
  });

  test("a caller that passes no surface writes no fingerprint", async () => {
    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: LEGAL_KEY, value: "Our own privacy policy" }],
    });
    const { error } = await adminClient.rpc("publish_site_content", {
      p_keys: [LEGAL_KEY],
    });

    expect(error).toBeNull();
    expect(await fingerprint()).toBeNull();
  });

  // Reverting to the platform's document hands the route back to text that is
  // regenerated on every request and so cannot go stale. A fingerprint left
  // behind would describe a document nobody is serving.
  test("clears the fingerprint when the tenant reverts to the platform's text", async () => {
    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: LEGAL_KEY, value: "Our own privacy policy" }],
    });
    await adminClient.rpc("publish_site_content", {
      p_keys: [LEGAL_KEY],
      p_legal_surface: SURFACE,
    });
    expect(await fingerprint()).not.toBeNull();

    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: LEGAL_KEY, value: null }],
    });
    await adminClient.rpc("publish_site_content", {
      p_keys: [LEGAL_KEY],
      p_legal_surface: SURFACE,
    });

    expect(await fingerprint()).toBeNull();
  });

  test("a later publish replaces the fingerprint rather than adding one", async () => {
    for (const surfaces of [["contact"], ["contact", "eventRegistrations"]]) {
      await adminClient.rpc("save_site_content_drafts", {
        p_entries: [{ key: LEGAL_KEY, value: `Revision ${surfaces.length}` }],
      });
      await adminClient.rpc("publish_site_content", {
        p_keys: [LEGAL_KEY],
        p_legal_surface: { surfaces },
      });
    }

    const { data } = await service
      .from("app_settings")
      .select("key")
      .eq("key", SETTING_KEY);
    expect(data).toHaveLength(1);
    expect((await fingerprint())?.surfaces).toEqual([
      "contact",
      "eventRegistrations",
    ]);
  });

  test("a session without site_content:manage cannot write one", async () => {
    const volunteer = await signInAs(SEEDED_USERS.volunteer);
    const { error } = await volunteer.rpc("publish_site_content", {
      p_keys: [LEGAL_KEY],
      p_legal_surface: SURFACE,
    });

    expect(error?.message).toContain("FORBIDDEN");
    expect(await fingerprint()).toBeNull();
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

// The second-approver gate (#600), where it is actually enforced. The Server
// Action and the dialog above it both refuse the same publishes, but they are
// courtesies: `site_content` is not writable by `authenticated` at all, so
// this function is the only path onto the public site and the only place the
// rule cannot be gone around.
describe("a tenant that requires a second approver on legal documents", () => {
  const LEGAL_KEY = "legal.privacy";
  const DOCUMENT = {
    title: "Privacy Policy",
    last_updated: "March 1, 2026",
    summary: ["What we do with your details."],
    sections: [
      { id: "collect", title: "What we collect", paragraphs: ["Your name."] },
    ],
  };
  const APPROVAL = {
    reference: "Board meeting, 4 March",
    notes: "Counsel read it first.",
  };

  async function setGate(required: boolean) {
    const { data: tenant } = await adminClient
      .from("site_content")
      .select("tenant_id")
      .limit(1)
      .single();
    await service.from("app_settings").upsert(
      {
        tenant_id: tenant!.tenant_id,
        key: "legal_approval.required",
        value: required,
      },
      { onConflict: "tenant_id,key" },
    );
  }

  /**
   * Rewrites who drafted the pending row, which is the only way to stage
   * "somebody else wrote this" here: the seed has one account holding
   * `site_content:manage`, and `draft_updated_by` is stamped from the session
   * by a trigger rather than sent, which is the property the gate rests on.
   * The trigger restamps only when the draft itself changes, so this update
   * leaves everything else exactly as the drafter left it.
   */
  async function draftedBySomebodyElse() {
    const other = await signInAs(SEEDED_USERS.coordinator);
    const { data: user } = await other.auth.getUser();
    await service
      .from("site_content")
      .update({ draft_updated_by: user.user!.id })
      .eq("key", LEGAL_KEY);
  }

  async function legalRow() {
    const { data } = await adminClient
      .from("site_content")
      .select(
        "value, has_draft, approved_by, approved_at, approval_reference, review_notes",
      )
      .eq("key", LEGAL_KEY)
      .maybeSingle();
    return data;
  }

  beforeEach(async () => {
    await setGate(true);
    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: LEGAL_KEY, value: DOCUMENT }],
    });
  });

  afterEach(async () => {
    await service.from("site_content").delete().eq("key", LEGAL_KEY);
    await service
      .from("app_settings")
      .delete()
      .eq("key", "legal_approval.required");
    await service
      .from("legal_document_versions")
      .delete()
      .eq("document", "privacy");
  });

  test("the drafter cannot publish their own text, approval or no approval", async () => {
    const { error } = await adminClient.rpc("publish_site_content", {
      p_keys: [LEGAL_KEY],
      p_approval: APPROVAL,
    });

    expect(error?.message).toContain("APPROVAL_SELF");
    expect((await legalRow())?.value).toBeNull();
  });

  test("a second person still has to say what approved it", async () => {
    await draftedBySomebodyElse();

    const { error } = await adminClient.rpc("publish_site_content", {
      p_keys: [LEGAL_KEY],
    });

    expect(error?.message).toContain("APPROVAL_REQUIRED");
    expect((await legalRow())?.value).toBeNull();
  });

  test("blank answers are not answers", async () => {
    await draftedBySomebodyElse();

    const { error } = await adminClient.rpc("publish_site_content", {
      p_keys: [LEGAL_KEY],
      p_approval: { reference: "  ", notes: "Fine by me." },
    });

    expect(error?.message).toContain("APPROVAL_REQUIRED");
  });

  // The approval lands on the row it approves, which `audit_log` snapshots on
  // this same publish -- so the record sits beside the exact text it is about.
  test("a second person publishes it, and the approval is recorded on the row", async () => {
    await draftedBySomebodyElse();

    const { error } = await adminClient.rpc("publish_site_content", {
      p_keys: [LEGAL_KEY],
      p_approval: APPROVAL,
    });
    expect(error).toBeNull();

    const row = await legalRow();
    const { data: user } = await adminClient.auth.getUser();
    expect(row?.value).toEqual(DOCUMENT);
    expect(row?.approved_by).toBe(user.user!.id);
    expect(row?.approved_at).not.toBeNull();
    expect(row?.approval_reference).toBe(APPROVAL.reference);
    expect(row?.review_notes).toBe(APPROVAL.notes);
  });

  // A draft written with no session behind it -- a service-role script -- has
  // no second pair of eyes to be checked against.
  test("a draft nobody is recorded as having written is refused", async () => {
    await service
      .from("site_content")
      .update({ draft_updated_by: null })
      .eq("key", LEGAL_KEY);

    const { error } = await adminClient.rpc("publish_site_content", {
      p_keys: [LEGAL_KEY],
      p_approval: APPROVAL,
    });

    expect(error?.message).toContain("APPROVAL_DRAFTER_UNKNOWN");
  });

  // The gate is about legal text alone. A page of ordinary copy publishing
  // beside a legal slot with nothing pending must not be held up by it.
  test("ordinary copy publishes untouched while the gate is on", async () => {
    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: KEY, value: "An ordinary heading" }],
    });

    const { error } = await adminClient.rpc("publish_site_content", {
      p_keys: [KEY],
    });

    expect(error).toBeNull();
    expect((await currentRow())?.value).toBe("An ordinary heading");
  });

  // No approval may outlive the text it was given for: publishing the next
  // draft with the gate off clears it rather than leaving it beside words
  // nobody approved.
  test("switching the gate off clears the approval on the next publish", async () => {
    await draftedBySomebodyElse();
    await adminClient.rpc("publish_site_content", {
      p_keys: [LEGAL_KEY],
      p_approval: APPROVAL,
    });

    await setGate(false);
    await adminClient.rpc("save_site_content_drafts", {
      p_entries: [{ key: LEGAL_KEY, value: { ...DOCUMENT, title: "Privacy" } }],
    });
    const { error } = await adminClient.rpc("publish_site_content", {
      p_keys: [LEGAL_KEY],
    });

    expect(error).toBeNull();
    const row = await legalRow();
    expect(row?.approval_reference).toBeNull();
    expect(row?.approved_by).toBeNull();
    expect(row?.review_notes).toBeNull();
  });
});

// The count behind the refusal that stops a single-administrator tenant
// switching the gate on. It is a question about other people's roles, which is
// why it is a definer function rather than a portal read.
describe("counting who could be the second approver", () => {
  test("counts this tenant's holders of site_content:manage", async () => {
    const { data, error } = await adminClient.rpc(
      "site_content_approver_count",
    );

    expect(error).toBeNull();
    expect(data).toBeGreaterThanOrEqual(1);
  });

  test("answers nought to somebody who could not act on it", async () => {
    const volunteer = await signInAs(SEEDED_USERS.volunteer);

    const { data } = await volunteer.rpc("site_content_approver_count");

    expect(data).toBe(0);
  });
});
