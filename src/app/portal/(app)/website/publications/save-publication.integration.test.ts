// Integration coverage for the publications editor's write path (#1472):
// `save_publication()` against a real local Supabase stack seeded by
// supabase/seed.sql, and the purge's reading of what is referenced.
//
// What only a real database can show: the page list is replaced in one
// transaction with positions renumbered under the deferred unique constraint,
// RLS decides who may call it (invoker rights), the #1471 guards still refuse
// a published issue losing a page's text, and a page cannot be moved in from
// another issue.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  serviceRoleClient,
  signInAs,
} from "../../../../../../test/integration-setup";

const service = serviceRoleClient();

/** The seeded 26-page published issue. */
const FALL = "b1b1b1b1-0000-4000-8000-000000000001";

let admin: SupabaseClient;
let volunteer: SupabaseClient;
let tenantId: string;
let issueId: string;

function page(n: number, text = true) {
  return {
    id: null,
    image_path: `${tenantId}/${issueId}/page-${n}-1600.webp`,
    width: 1600,
    height: 2263,
    image_renditions: [
      { path: `${tenantId}/${issueId}/page-${n}-480.webp`, width: 480 },
    ],
    alt_text: text ? `Page ${n}` : "",
    transcript: text ? `Words on page ${n}` : "",
  };
}

const details = {
  slug: "",
  title: "Editor Test Issue",
  season_label: "Spring",
  publish_date: "2027-03-20",
  blurb: "",
  cover_path: null,
  cover_width: null,
  cover_height: null,
  cover_renditions: [],
  reading_pdf_path: null,
  reading_pdf_bytes: null,
  print_pdf_path: null,
  print_pdf_bytes: null,
};

async function pagesOf(id: string) {
  const { data } = await service
    .from("publication_pages")
    .select("id, position, alt_text")
    .eq("publication_id", id)
    .order("position");
  return data ?? [];
}

beforeAll(async () => {
  admin = await signInAs(SEEDED_USERS.admin);
  volunteer = await signInAs(SEEDED_USERS.volunteer);
  const { data: tenant } = await admin.rpc("current_tenant_id");
  tenantId = tenant as string;

  details.slug = `editor-test-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await admin
    .from("publications")
    .insert({ title: details.title, slug: details.slug })
    .select("id")
    .single();
  if (error) throw error;
  issueId = data.id;
});

afterAll(async () => {
  await service.from("publications").delete().eq("id", issueId);
});

describe("save_publication", () => {
  test("writes the details and the pages in the order given", async () => {
    const { error } = await admin.rpc("save_publication", {
      p_id: issueId,
      p_issue: details,
      p_pages: [page(1), page(2), page(3)],
    });
    expect(error).toBeNull();

    const pages = await pagesOf(issueId);
    expect(pages.map((p) => [p.position, p.alt_text])).toEqual([
      [1, "Page 1"],
      [2, "Page 2"],
      [3, "Page 3"],
    ]);

    const { data: issue } = await service
      .from("publications")
      .select("season_label, publish_date, blurb")
      .eq("id", issueId)
      .single();
    expect(issue).toEqual({
      season_label: "Spring",
      publish_date: "2027-03-20",
      blurb: null,
    });
  });

  test("reorders and removes in one call", async () => {
    const [one, two, three] = await pagesOf(issueId);
    const keep = (row: { id: string }, n: number) => ({
      ...page(n),
      id: row.id,
    });

    const { error } = await admin.rpc("save_publication", {
      p_id: issueId,
      p_issue: details,
      // Page 3 first, page 1 second, page 2 gone.
      p_pages: [keep(three, 3), keep(one, 1)],
    });
    expect(error).toBeNull();

    const pages = await pagesOf(issueId);
    expect(pages.map((p) => [p.id, p.position])).toEqual([
      [three.id, 1],
      [one.id, 2],
    ]);
    expect(pages.some((p) => p.id === two.id)).toBe(false);
  });

  test("refuses a page that belongs to another issue", async () => {
    const [foreign] = await pagesOf(FALL);
    const { error } = await admin.rpc("save_publication", {
      p_id: issueId,
      p_issue: details,
      p_pages: [{ ...page(1), id: foreign.id }],
    });
    expect(error?.message).toContain("PUBLICATION_PAGES_INVALID");
    expect(await pagesOf(FALL)).toHaveLength(26);
  });

  test("a volunteer cannot save an issue", async () => {
    const { error } = await volunteer.rpc("save_publication", {
      p_id: issueId,
      p_issue: { ...details, title: "Changed" },
      p_pages: [],
    });
    expect(error?.message).toContain("PUBLICATION_NOT_FOUND");
    expect(await pagesOf(issueId)).toHaveLength(2);
  });

  test("a published issue cannot lose a page's transcript", async () => {
    const pages = await pagesOf(issueId);
    const published = await admin
      .from("publications")
      .update({ status: "published" })
      .eq("id", issueId);
    expect(published.error).toBeNull();

    const { error } = await admin.rpc("save_publication", {
      p_id: issueId,
      p_issue: details,
      p_pages: pages.map((row, i) => ({
        ...page(i + 1, i !== 0),
        id: row.id,
      })),
    });
    expect(error?.message).toContain("PUBLICATION_INCOMPLETE");

    // The whole save rolled back: nothing about the issue changed.
    expect((await pagesOf(issueId)).map((p) => p.alt_text)).toEqual(
      pages.map((p) => p.alt_text),
    );
  });

  test("a published issue can be deleted once unpublished", async () => {
    await admin
      .from("publications")
      .update({ status: "draft" })
      .eq("id", issueId);
    const { error } = await admin
      .from("publications")
      .delete()
      .eq("id", issueId)
      .select("id");
    expect(error).toBeNull();
    expect(await pagesOf(issueId)).toHaveLength(0);
  });
});
