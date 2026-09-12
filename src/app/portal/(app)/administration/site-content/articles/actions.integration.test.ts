// The article collection behind /learn (#894), against a real stack.
//
// Mocks cannot answer what this file exists for. Two properties matter and
// both are column-privilege and RLS questions:
//
//   1. A session holding `site_content:manage` cannot reach `articles.value`
//      or `article_categories.value` any way other than
//      `publish_article_category`. If it could, publishing would not be a step
//      and neither would removal.
//   2. A removal travels through publish like every other change: an article
//      dropped from a save is still on the public site until the category is
//      published.
import { afterEach, describe, expect, test } from "bun:test";
import {
  adminClient,
  anonClient,
  serviceRoleClient,
} from "../../../../../../../test/integration-setup";

// Cleanup runs as service_role: `authenticated` cannot delete a published row
// at all, which is half of what this file asserts.
const service = serviceRoleClient();

const SLUG = `test-${Math.random().toString(36).slice(2, 10)}`;

function body(title: string, overrides: Record<string, unknown> = {}) {
  return {
    title,
    description: `About ${title}`,
    paragraphs: ["One paragraph."],
    list: [{ label: "A point", text: "With some text." }],
    links: [{ label: "Programs", href: "/programs", internal: true }],
    disclaimer: "Not advice.",
    ...overrides,
  };
}

async function saveCategory(
  articles: { id?: string; anchor: string; value: unknown }[],
  categoryId?: string,
) {
  const { data, error } = await adminClient.rpc("save_article_drafts", {
    p_category: {
      id: categoryId ?? null,
      slug: SLUG,
      value: { title: "Test category", description: "A test category." },
    },
    p_articles: articles.map((article) => ({
      id: article.id ?? null,
      anchor: article.anchor,
      value: article.value,
    })),
  });
  expect(error).toBeNull();
  return data as string;
}

async function categoryRow(id: string) {
  const { data } = await adminClient
    .from("article_categories")
    .select(
      "slug, position, draft_position, value, draft_value, has_draft, published_at, published_by",
    )
    .eq("id", id)
    .maybeSingle();
  return data;
}

async function articleRows(categoryId: string) {
  const { data } = await adminClient
    .from("articles")
    .select(
      "id, anchor, position, draft_position, value, draft_value, has_draft",
    )
    .eq("category_id", categoryId)
    .order("anchor");
  return data ?? [];
}

afterEach(async () => {
  await service.from("article_categories").delete().eq("slug", SLUG);
});

describe("saving a draft", () => {
  test("stages a new category and its articles with nothing published", async () => {
    const id = await saveCategory([
      { anchor: "first", value: body("First") },
      { anchor: "second", value: body("Second") },
    ]);

    const category = await categoryRow(id);
    expect(category?.has_draft).toBe(true);
    expect(category?.value).toBeNull();
    expect(category?.published_at).toBeNull();

    const articles = await articleRows(id);
    expect(articles).toHaveLength(2);
    expect(articles.every((article) => article.value === null)).toBe(true);
    // Position is the array index the save arrived in, not a number the
    // browser sent.
    expect(
      articles.map((article) => [article.anchor, article.draft_position]),
    ).toEqual([
      ["first", 0],
      ["second", 1],
    ]);

    const { data: publicCategories } = await anonClient()
      .from("public_article_categories")
      .select("slug")
      .eq("slug", SLUG);
    expect(publicCategories).toEqual([]);
  });

  test("stamps who drafted it, whatever the caller sends", async () => {
    const id = await saveCategory([{ anchor: "first", value: body("First") }]);

    const { data } = await adminClient
      .from("article_categories")
      .select("draft_updated_by, draft_updated_at")
      .eq("id", id)
      .single();
    const { data: user } = await adminClient.auth.getUser();
    expect(data?.draft_updated_by).toBe(user.user!.id);
    expect(data?.draft_updated_at).not.toBeNull();
  });
});

describe("publishing", () => {
  test("puts the category and its articles on the public site", async () => {
    const id = await saveCategory([
      { anchor: "first", value: body("First") },
      { anchor: "second", value: body("Second") },
    ]);
    const { error } = await adminClient.rpc("publish_article_category", {
      p_id: id,
    });
    expect(error).toBeNull();

    const category = await categoryRow(id);
    expect(category?.has_draft).toBe(false);
    expect(category?.draft_value).toBeNull();
    expect(category?.published_at).not.toBeNull();
    const { data: user } = await adminClient.auth.getUser();
    expect(category?.published_by).toBe(user.user!.id);

    const anon = anonClient();
    const { data: publicCategories } = await anon
      .from("public_article_categories")
      .select("id, slug, position")
      .eq("slug", SLUG);
    expect(publicCategories).toHaveLength(1);

    const { data: publicArticles } = await anon
      .from("public_articles")
      .select("anchor, position")
      .eq("category_id", id)
      .order("position");
    expect(publicArticles).toEqual([
      { anchor: "first", position: 0 },
      { anchor: "second", position: 1 },
    ]);
  });

  test("a reorder only reaches the site once it is published", async () => {
    const id = await saveCategory([
      { anchor: "first", value: body("First") },
      { anchor: "second", value: body("Second") },
    ]);
    await adminClient.rpc("publish_article_category", { p_id: id });

    const saved = await articleRows(id);
    const byAnchor = new Map(saved.map((row) => [row.anchor, row.id]));
    await saveCategory(
      [
        { id: byAnchor.get("second"), anchor: "second", value: body("Second") },
        { id: byAnchor.get("first"), anchor: "first", value: body("First") },
      ],
      id,
    );

    const anon = anonClient();
    const before = await anon
      .from("public_articles")
      .select("anchor, position")
      .eq("category_id", id)
      .order("position");
    expect(before.data).toEqual([
      { anchor: "first", position: 0 },
      { anchor: "second", position: 1 },
    ]);

    await adminClient.rpc("publish_article_category", { p_id: id });
    const after = await anon
      .from("public_articles")
      .select("anchor, position")
      .eq("category_id", id)
      .order("position");
    expect(after.data).toEqual([
      { anchor: "second", position: 0 },
      { anchor: "first", position: 1 },
    ]);
  });
});

describe("removal goes through publish", () => {
  test("an article dropped from a save stays live until the category is published", async () => {
    const id = await saveCategory([
      { anchor: "first", value: body("First") },
      { anchor: "second", value: body("Second") },
    ]);
    await adminClient.rpc("publish_article_category", { p_id: id });

    const saved = await articleRows(id);
    const keep = saved.find((row) => row.anchor === "first")!;
    await saveCategory(
      [{ id: keep.id, anchor: "first", value: body("First") }],
      id,
    );

    const anon = anonClient();
    const before = await anon
      .from("public_articles")
      .select("anchor")
      .eq("category_id", id);
    expect(before.data).toHaveLength(2);

    await adminClient.rpc("publish_article_category", { p_id: id });

    const after = await anon
      .from("public_articles")
      .select("anchor")
      .eq("category_id", id);
    expect(after.data).toEqual([{ anchor: "first" }]);
    // The row is gone rather than left behind as a tombstone: unlike a slot,
    // an article has no default to revert to.
    expect(await articleRows(id)).toHaveLength(1);
  });

  test("deleting a never-published category takes it away immediately", async () => {
    const id = await saveCategory([{ anchor: "first", value: body("First") }]);
    await adminClient.rpc("delete_article_category", { p_id: id });

    expect(await categoryRow(id)).toBeNull();
    expect(await articleRows(id)).toHaveLength(0);
  });

  test("deleting a published category stages it and publish finishes it", async () => {
    const id = await saveCategory([{ anchor: "first", value: body("First") }]);
    await adminClient.rpc("publish_article_category", { p_id: id });
    await adminClient.rpc("delete_article_category", { p_id: id });

    const anon = anonClient();
    const before = await anon
      .from("public_article_categories")
      .select("slug")
      .eq("slug", SLUG);
    expect(before.data).toHaveLength(1);

    await adminClient.rpc("publish_article_category", { p_id: id });
    expect(await categoryRow(id)).toBeNull();
    const after = await anon
      .from("public_article_categories")
      .select("slug")
      .eq("slug", SLUG);
    expect(after.data).toEqual([]);
  });
});

describe("discarding", () => {
  test("drops a pending change and keeps what is published", async () => {
    const id = await saveCategory([{ anchor: "first", value: body("First") }]);
    await adminClient.rpc("publish_article_category", { p_id: id });

    const saved = await articleRows(id);
    await saveCategory(
      [
        {
          id: saved[0].id,
          anchor: "first",
          value: body("A different title"),
        },
        { anchor: "brand-new", value: body("Brand new") },
      ],
      id,
    );
    await adminClient.rpc("discard_article_drafts", { p_id: id });

    const articles = await articleRows(id);
    // The published article keeps its published words; the one that was only
    // ever a draft leaves nothing behind.
    expect(articles).toHaveLength(1);
    expect((articles[0].value as { title: string }).title).toBe("First");
    expect(articles[0].has_draft).toBe(false);
  });
});

describe("publishing cannot be reached any other way", () => {
  test("an authenticated session cannot write `value` directly", async () => {
    const id = await saveCategory([{ anchor: "first", value: body("First") }]);
    const saved = await articleRows(id);

    const category = await adminClient
      .from("article_categories")
      .update({ value: { title: "Sneaked in", description: "" } })
      .eq("id", id);
    expect(category.error).not.toBeNull();

    const article = await adminClient
      .from("articles")
      .update({ value: body("Sneaked in") })
      .eq("id", saved[0].id);
    expect(article.error).not.toBeNull();

    const row = await categoryRow(id);
    expect(row?.value).toBeNull();
  });

  test("an authenticated session cannot insert a row of its own", async () => {
    const { error } = await adminClient.from("article_categories").insert({
      slug: `${SLUG}-direct`,
      value: { title: "x", description: "" },
    });
    expect(error).not.toBeNull();
  });

  test("anon cannot read either base table", async () => {
    const anon = anonClient();
    const categories = await anon.from("article_categories").select("id");
    expect(categories.data ?? []).toEqual([]);
    const articles = await anon.from("articles").select("id");
    expect(articles.data ?? []).toEqual([]);
  });
});
