// Integration test: exercises the real content-brief-template Server Actions
// against a real local Supabase stack (checkPermission, then real
// `content_brief_templates` / `content_brief_template_versions` RLS --
// content_calendar: admin/event_coordinator manage, finance/board/volunteer
// view). Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  signInAs,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  createTemplateAction,
  updateTemplateMetadataAction,
  publishTemplateVersionAction,
  listActiveContentBriefTemplatesAction,
} = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

// Template keys must be lowercase letters/numbers/underscores starting with
// a letter, so a raw UUID (dashes, possible leading digit) won't do.
function uniqueTemplateKey() {
  return `it_${crypto.randomUUID().replace(/-/g, "_")}`;
}

function templateForm(key: string, overrides: { name?: string } = {}) {
  const fd = new FormData();
  fd.set("key", key);
  fd.set("name", overrides.name ?? "Integration test template");
  fd.set("isActive", "true");
  fd.set("requiresConsent", "false");
  fd.set(
    "fields",
    JSON.stringify([{ key: "hook", label: "Hook", help_text: null }]),
  );
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

async function findTemplateByKey(key: string) {
  const { data, error } = await adminClient
    .from("content_brief_templates")
    .select("id")
    .eq("key", key)
    .single();
  if (error) throw error;
  return data.id as string;
}

async function cleanupTemplate(id: string) {
  // Versions reference the template with on delete cascade; the template's
  // own current_version_id pointer goes with the row.
  await adminClient.from("content_brief_templates").delete().eq("id", id);
}

describe("content brief template actions (integration)", () => {
  test("requires a signed-in user to create a template", async () => {
    currentSupabase = anonClient();
    expect(
      await createTemplateAction(templateForm(uniqueTemplateKey())),
    ).toEqual({ error: "You must be signed in to create a template." });
  });

  test("admin role (content_calendar manage) can create, update, and revise a template", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const key = uniqueTemplateKey();

    expect(await createTemplateAction(templateForm(key))).toEqual({
      success: true,
    });
    const id = await findTemplateByKey(key);

    expect(
      await updateTemplateMetadataAction(
        id,
        templateForm(key, { name: "Integration test template (renamed)" }),
      ),
    ).toEqual({ success: true });
    const { data: renamed } = await adminClient
      .from("content_brief_templates")
      .select("name")
      .eq("id", id)
      .single();
    expect(renamed?.name).toBe("Integration test template (renamed)");

    expect(await publishTemplateVersionAction(id, templateForm(key))).toEqual({
      success: true,
    });
    const { data: versions } = await adminClient
      .from("content_brief_template_versions")
      .select("version")
      .eq("template_id", id)
      .order("version", { ascending: true });
    expect(versions?.map((row) => row.version)).toEqual([1, 2]);

    const listed = await listActiveContentBriefTemplatesAction();
    if (!("data" in listed)) throw new Error("expected data");
    const ours = listed.data.find((template) => template.key === key);
    expect(ours?.version).toBe(2);

    await cleanupTemplate(id);
  });

  test("event_coordinator role (content_calendar manage) can create a template", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    const key = uniqueTemplateKey();

    expect(await createTemplateAction(templateForm(key))).toEqual({
      success: true,
    });

    await cleanupTemplate(await findTemplateByKey(key));
  });

  test("finance role (content_calendar view only) can list templates but not write", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    expect("data" in (await listActiveContentBriefTemplatesAction())).toBe(
      true,
    );
    expect(
      await createTemplateAction(templateForm(uniqueTemplateKey())),
    ).toEqual(DENIED);
    expect(
      await updateTemplateMetadataAction(
        crypto.randomUUID(),
        templateForm(uniqueTemplateKey()),
      ),
    ).toEqual(DENIED);
    expect(
      await publishTemplateVersionAction(
        crypto.randomUUID(),
        templateForm(uniqueTemplateKey()),
      ),
    ).toEqual(DENIED);
  });

  test("board role (content_calendar view only) can list templates but not write", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect("data" in (await listActiveContentBriefTemplatesAction())).toBe(
      true,
    );
    expect(
      await createTemplateAction(templateForm(uniqueTemplateKey())),
    ).toEqual(DENIED);
  });

  test("volunteer role (content_calendar view only) can list templates but not write", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    expect("data" in (await listActiveContentBriefTemplatesAction())).toBe(
      true,
    );
    expect(
      await createTemplateAction(templateForm(uniqueTemplateKey())),
    ).toEqual(DENIED);
  });

  test("a no-role account can neither list nor create templates", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);

    expect(await listActiveContentBriefTemplatesAction()).toEqual(DENIED);
    expect(
      await createTemplateAction(templateForm(uniqueTemplateKey())),
    ).toEqual(DENIED);
  });

  test("a deactivated (former) account cannot create a template", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.former);
    expect(
      await createTemplateAction(templateForm(uniqueTemplateKey())),
    ).toEqual(DENIED);
  });
});
