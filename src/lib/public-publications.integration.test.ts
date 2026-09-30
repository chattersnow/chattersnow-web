// Integration coverage for publications (#1471), against a real local
// Supabase stack seeded by supabase/seed.sql: two published issues and one
// draft.
//
// What only a real database can show: the definer views serve published issues
// and nothing else to `anon`, the base tables are closed to it, the bucket's
// writes follow `publications:manage` and the tenant prefix, and the two
// guards hold the slug freeze and the transcript rule.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  serviceRoleClient,
  signInAs,
} from "../../test/integration-setup";
import { PUBLICATION_FILES_BUCKET } from "./publications";

const service = serviceRoleClient();
const anon = anonClient();

const FALL = "b1b1b1b1-0000-4000-8000-000000000001";
const DRAFT = "b1b1b1b1-0000-4000-8000-000000000003";

let admin: SupabaseClient;
let volunteer: SupabaseClient;
let tenantId: string;
const created: string[] = [];

function webp() {
  return new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46])], {
    type: "image/webp",
  });
}

beforeAll(async () => {
  const { data, error } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (error) throw error;
  tenantId = data.id as string;
  admin = await signInAs(SEEDED_USERS.admin);
  volunteer = await signInAs(SEEDED_USERS.volunteer);
});

afterAll(async () => {
  if (created.length) {
    await service.storage.from(PUBLICATION_FILES_BUCKET).remove(created);
  }
});

describe("the public read", () => {
  test("serves published issues and never a draft", async () => {
    const { data, error } = await anon
      .from("public_publications")
      .select("slug")
      .order("publish_date", { ascending: false });
    expect(error).toBeNull();
    expect(data?.map((row) => row.slug)).toEqual(["fall-2026", "summer-2026"]);

    const pages = await anon
      .from("public_publication_pages")
      .select("position")
      .eq("publication_id", DRAFT);
    expect(pages.data).toEqual([]);
  });

  test("serves every page of a published issue, in order", async () => {
    const { data } = await anon
      .from("public_publication_pages")
      .select("position, alt_text, transcript")
      .eq("publication_id", FALL)
      .order("position");
    expect(data).toHaveLength(26);
    expect(data?.every((page) => page.alt_text && page.transcript)).toBe(true);
  });

  test("the base tables are closed to anon", async () => {
    for (const table of ["publications", "publication_pages"]) {
      const { data, error } = await anon.from(table).select("id");
      // A revoked table answers with an error; either way nothing leaves.
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    }
  });
});

describe("the guards", () => {
  test("a published issue's slug cannot change", async () => {
    const { error } = await admin
      .from("publications")
      .update({ slug: "fall-2026-renamed" })
      .eq("id", FALL);
    expect(error?.message).toContain("PUBLICATION_SLUG_LOCKED");
  });

  test("an issue with a page missing its transcript cannot publish", async () => {
    const { error } = await admin
      .from("publications")
      .update({ status: "published" })
      .eq("id", DRAFT);
    expect(error?.message).toContain("PUBLICATION_INCOMPLETE");
  });

  test("a volunteer cannot edit an issue", async () => {
    const { data } = await volunteer
      .from("publications")
      .update({ title: "Changed" })
      .eq("id", FALL)
      .select("id");
    expect(data ?? []).toEqual([]);
  });
});

describe("publication-files", () => {
  test("is public, capped at 25 MiB and takes images and PDFs", async () => {
    const { data: bucket } = await service.storage.getBucket(
      PUBLICATION_FILES_BUCKET,
    );
    expect(bucket?.public).toBe(true);
    expect(bucket?.file_size_limit).toBe(26214400);
    expect(bucket?.allowed_mime_types).toContain("application/pdf");
  });

  test("an admin uploads under tenant/issue; nobody writes elsewhere", async () => {
    const good = `${tenantId}/${FALL}/${crypto.randomUUID()}.webp`;
    created.push(good);
    const ok = await admin.storage
      .from(PUBLICATION_FILES_BUCKET)
      .upload(good, webp(), { contentType: "image/webp" });
    expect(ok.error).toBeNull();

    const flat = `${tenantId}/${crypto.randomUUID()}.webp`;
    created.push(flat);
    const refused = await admin.storage
      .from(PUBLICATION_FILES_BUCKET)
      .upload(flat, webp(), { contentType: "image/webp" });
    expect(refused.error).not.toBeNull();

    const byVolunteer = `${tenantId}/${FALL}/${crypto.randomUUID()}.webp`;
    created.push(byVolunteer);
    const denied = await volunteer.storage
      .from(PUBLICATION_FILES_BUCKET)
      .upload(byVolunteer, webp(), { contentType: "image/webp" });
    expect(denied.error).not.toBeNull();
  });
});
